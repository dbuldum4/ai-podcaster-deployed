<template>
  <div id="app" class="container">
    <h1>AI Podcaster</h1>

    <!-- Podcast Form -->
    <form @submit.prevent="generate" class="podcast-form">
      <!-- Enter a Topic Section -->
      <div class="form-section">
        <h2 class="section-title">Enter a Topic</h2>
        <div class="form-group">
          <input
            id="topic"
            type="text"
            v-model="podcastTopic"
            class="form-control"
            placeholder="e.g., 'Mindfulness Meditation'"
            required
          />
        </div>
      </div>

      <!-- Choose a Length Section -->
      <div class="form-section">
        <h2 class="section-title">Choose a Length</h2>
        <div class="form-group options-group">
          <label class="option-label">
            <input type="radio" v-model="podcastLength" value="short" />
            <span class="radio-custom"></span>
            Short
          </label>
          <label class="option-label">
            <input type="radio" v-model="podcastLength" value="medium" />
            <span class="radio-custom"></span>
            Medium
          </label>
          <label class="option-label">
            <input type="radio" v-model="podcastLength" value="long" />
            <span class="radio-custom"></span>
            Long
          </label>
        </div>
      </div>

      <!-- Choose a Persona Section -->
      <div class="form-section">
        <h2 class="section-title">Choose a Persona</h2>
        <div class="form-group options-group">
          <label class="option-label">
            <input type="radio" v-model="selectedPersona" value="trump" />
            <span class="radio-custom"></span>
            Trump
          </label>
          <label class="option-label">
            <input type="radio" v-model="selectedPersona" value="professor" />
            <span class="radio-custom"></span>
            Professor
          </label>
          <label class="option-label">
            <input type="radio" v-model="selectedPersona" value="best_friend" />
            <span class="radio-custom"></span>
            Best Friend
          </label>
        </div>
      </div>

      <!-- Choose a Voice Section -->
      <div class="form-section">
        <h2 class="section-title">Choose a Voice</h2>
        <div class="form-group">
          <select v-model="selectedVoice" class="form-control" required>
            <option disabled value="">-- Select a Voice --</option>
            <option
              v-for="voice in voices"
              :key="voice.name"
              :value="voice"
            >
              {{ voice.displayName }} ({{ voice.languageCode }}) - {{ voice.ssmlGender }}
            </option>
          </select>
        </div>
      </div>

      <!-- Generate Button -->
      <button
        type="submit"
        :disabled="loading"
        class="button generate-button"
        aria-label="Generate Audio Story"
      >
        <span v-if="loading" class="spinner"></span>
        {{ loading ? 'Generating...' : 'Generate' }}
      </button>
    </form>

    <!-- Status Message -->
    <div v-if="status" class="status-message">
      {{ status }}
    </div>

    <!-- Audio Player -->
    <div v-if="audioSrc" class="audio-player">
      <h2>Your Podcast Audio</h2>
      <audio :src="audioSrc" controls></audio>
      <br />
      <a :href="audioSrc" download="story.wav" class="download-btn">Download Audio</a>
    </div>
  </div>
</template>

<script>
import CONFIG from './config'; // Ensure this path is correct

export default {
  name: 'App',
  data() {
    return {
      // OAuth 2.0 Credentials
      geminiKey: CONFIG.GEMINI_KEY,
      clientId: CONFIG.CLIENT_ID,
      clientSecret: CONFIG.CLIENT_SECRET,
      refreshToken: CONFIG.REFRESH_TOKEN,

      // Token Management
      accessToken: '',
      expiresAt: null, // Timestamp when the access token expires

      // Podcast form data
      podcastTopic: '',
      podcastLength: 'medium',    // Default to "medium"
      selectedVoice: null,        // User-selected voice
      selectedPersona: 'trump',   // Default selection

      // Persona Styles Mapping
      personaStyles: {
        trump: "Donald Trump",
        professor: "a knowledgeable professor",
        best_friend: "a friendly best friend"
      },

      // Define your bucket name here
      bucketName: 'podcaster-bucket', // Replace with your actual bucket name

      // List of available voices with accents and genders
      voices: [
        { name: 'en-US-Journey-D', displayName: 'Journey D', languageCode: 'en-US', ssmlGender: 'MALE' },
        { name: 'en-US-Journey-F', displayName: 'Journey F', languageCode: 'en-US', ssmlGender: 'FEMALE' },
        { name: 'en-GB-Journey-D', displayName: 'Journey D', languageCode: 'en-GB', ssmlGender: 'MALE' },
        { name: 'en-GB-Journey-O', displayName: 'Journey O', languageCode: 'en-GB', ssmlGender: 'FEMALE' },
        { name: 'en-AU-Journey-D', displayName: 'Journey D', languageCode: 'en-AU', ssmlGender: 'MALE' },
        { name: 'en-AU-Journey-F', displayName: 'Journey F', languageCode: 'en-AU', ssmlGender: 'FEMALE' },
      ],

      // Status messages and loading state
      loading: false,
      status: '',

      // Audio URL received from TTS
      audioSrc: '',

      // Correct quotaProjectId
      quotaProjectId: '287269128315', // Replace with your actual project ID
    };
  },
  mounted() {
    // Initialize by refreshing the access token
    this.refreshAccessToken();
  },
  methods: {
    /**
     * Refreshes the OAuth 2.0 access token using the refresh token.
     */
    async refreshAccessToken() {
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('refresh_token', this.refreshToken);
      params.append('grant_type', 'refresh_token');

      try {
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to refresh access token: ${errorData.error}`);
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        const expiresIn = data.expires_in; // Typically 3600 seconds
        this.expiresAt = Date.now() + expiresIn * 1000;

        console.log('Access token refreshed successfully.');
      } catch (error) {
        console.error('Error refreshing access token:', error);
        this.status = `Error refreshing access token: ${error.message}`;
      }
    },

    /**
     * Ensures that a valid access token is available.
     * Refreshes the token if it has expired or is about to expire.
     */
    async ensureAccessToken() {
      const bufferTime = 60 * 1000; // 1 minute buffer
      if (!this.accessToken || (this.expiresAt && Date.now() + bufferTime >= this.expiresAt)) {
        await this.refreshAccessToken();
      }
    },

    /**
     * Deletes all files from the specified Google Cloud Storage bucket.
     */
    async deleteAllFiles() {
      try {
        this.status = 'Deleting all files...';
        await this.ensureAccessToken();

        const listResponse = await fetch(`https://storage.googleapis.com/storage/v1/b/${this.bucketName}/o`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        });

        if (!listResponse.ok) {
          const errorText = await listResponse.text();
          throw new Error(`Failed to list objects: ${errorText}`);
        }

        const listData = await listResponse.json();
        const items = listData.items;

        if (!items || items.length === 0) {
          this.status = 'No files to delete.';
          return;
        }

        for (const item of items) {
          const deleteResponse = await fetch(
            `https://storage.googleapis.com/storage/v1/b/${this.bucketName}/o/${encodeURIComponent(item.name)}`, 
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`
              }
            }
          );
          if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error(`Failed to delete ${item.name}: ${errorText}`);
          }
        }

        this.status = 'All files deleted successfully.';
      } catch (error) {
        console.error('Error deleting files:', error);
        this.status = `Error: ${error.message}`;
      }
    },

    /**
     * Polls a long-running operation until it's completed.
     * @param {string} operationName - The name of the operation to poll.
     * @param {string} accessToken - The OAuth2 access token.
     */
    async pollLongRunningOperation(operationName, accessToken) {
      const pollIntervalMs = 3000; // Poll every 3 seconds

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const pollUrl = `https://texttospeech.googleapis.com/v1/${operationName}`;
        const pollResp = await fetch(pollUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "x-goog-user-project": this.quotaProjectId
          }
        });

        if (!pollResp.ok) {
          const errText = await pollResp.text();
          throw new Error(`Polling failed: ${pollResp.status} - ${errText}`);
        }

        const pollResult = await pollResp.json();

        if (pollResult.done) {
          if (pollResult.error) {
            throw new Error(`Long-form TTS error: ${pollResult.error.message || "unknown"}`);
          }
          console.log("Operation completed successfully:", pollResult);
          return pollResult;
        } else {
          console.log("Operation still in progress...");
        }
      }
    },

    /**
     * Fetches the generated audio file from Google Cloud Storage and sets it to the audio player.
     * @param {string} objectName - The name of the audio object in GCS.
     */
    async getFileFromGCS(objectName) {
      try {
        this.status = 'Fetching audio from GCS...';
        const response = await fetch(`https://storage.googleapis.com/${this.bucketName}/${objectName}`, {
          headers: {
            "Authorization": `Bearer ${this.accessToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch audio from GCS: ${await response.text()}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        this.audioSrc = blobUrl;

        this.status = 'Audio is ready.';
      } catch (error) {
        console.error('Error fetching audio from GCS:', error);
        this.status = `Error: ${error.message}`;
      }
    },

    /**
     * Initiates the Text-to-Speech process to convert text to audio.
     */
    async speakText(text) {
      try {
        this.status = 'Generating audio...';
        await this.ensureAccessToken();

        const accessToken = this.accessToken;
        const timestamp = Date.now();
        const objectName = `tts-output-${timestamp}.wav`;
        const outputGcsUri = `gs://${this.bucketName}/${objectName}`;

        const requestBody = {
          parent: `projects/${this.quotaProjectId}/locations/global`,
          input: {
            text: text
          },
          audio_config: {
            audio_encoding: "LINEAR16"
          },
          voice: {
            language_code: this.selectedVoice.languageCode,
            name: this.selectedVoice.name,
            ssml_gender: this.selectedVoice.ssmlGender
          },
          "output_gcs_uri": outputGcsUri
        };

        const response = await fetch(
          `https://texttospeech.googleapis.com/v1beta1/projects/${this.quotaProjectId}/locations/global:synthesizeLongAudio`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
              "x-goog-user-project": this.quotaProjectId
            },
            body: JSON.stringify(requestBody)
          }
        );

        if (!response.ok) {
          const errMsg = await response.text();
          throw new Error(`Error: ${response.status} - ${errMsg}`);
        }

        const data = await response.json();
        const operationName = data.name;

        // Poll until done
        await this.pollLongRunningOperation(operationName, accessToken);

        // Fetch final audio
        await this.getFileFromGCS(objectName);
      } catch (err) {
        console.error("Error in speakText:", err);
        this.status = `Error: ${err.message}`;
      }
    },

    /**
     * Generates content using the Gemini API and initiates the TTS process.
     */
    async generate() {
      this.loading = true;
      this.audioSrc = '';
      this.status = 'Generating podcast...';

      try {
        // Delete existing files in the bucket to keep it clean
        await this.deleteAllFiles();

        // Validate form input
        if (!this.podcastTopic.trim()) {
          throw new Error("Please enter a topic for your podcast.");
        }

        // Validate voice selection
        if (!this.selectedVoice) {
          throw new Error("Please select a voice for your podcast.");
        }

        // Validate persona selection
        if (!this.selectedPersona) {
          throw new Error("Please select a persona for your podcast.");
        }

        // Build a user prompt based on topic, chosen length, and selected persona
        this.status = 'Generating content with Gemini...';
        const personaStyle = this.personaStyles[this.selectedPersona] || "Donald Trump"; // Fallback to Trump
        const userPrompt = `Create a ${this.podcastLength} podcast script about: ${this.podcastTopic}. You should only output the podcast, no other extra text. There should be no sound effects, or introduction music queues. Only content and text. I also want it in the style of ${personaStyle}.`;

        // Prepare request body for Gemini
        const requestBody = {
          contents: [
            {
              parts: [{ text: userPrompt }]
            }
          ]
        };

        // Gemini API call
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${this.geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }
        );

        if (!geminiResponse.ok) {
          const errMsg = await geminiResponse.text();
          throw new Error(`Gemini Error: ${geminiResponse.status} - ${errMsg}`);
        }

        const data = await geminiResponse.json();
        console.log('Gemini API Response:', data);

        const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!outputText) {
          throw new Error('Gemini did not return any content.');
        }

        // Convert the generated text to speech
        await this.speakText(outputText);
      } catch (error) {
        console.error("Generate request failed:", error);
        this.status = `Error: ${error.message}`;
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style>
/* General Styles */
:root {
  --background-color: #121212;
  --form-background: #1e1e1e;
  --text-color: #ffffff;
  --input-background: #2c2c2c;
  --input-border: #444444;
  --button-background: #1e90ff;
  --button-hover: #1c86ee;
  --button-disabled: #6c757d;
  --option-background: #555555;
  --option-hover: #666666;
  --option-checked: #1e90ff;
  --spinner-border: rgba(255, 255, 255, 0.3);
  --spinner-color: #ffffff;
  --status-color: #ffffff;
  --download-button-background: #28a745;
  --download-button-hover: #218838;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--background-color);
  color: var(--text-color);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

a {
  font-weight: 500;
  color: #1e90ff; /* DodgerBlue */
  text-decoration: none;
}

a:hover {
  color: #63b3ed; /* Lighter blue on hover */
}

h1 {
  font-size: 2.5em;
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

button {
  border-radius: 4px;
  border: none;
  padding: 0.75em 1.5em;
  font-size: 1em;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.3s, opacity 0.3s;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Spinner Animation */
.spinner {
  border: 4px solid var(--spinner-border);
  border-top: 4px solid var(--spinner-color);
  border-radius: 50%;
  width: 18px;
  height: 18px;
  animation: spin 1s linear infinite;
  display: inline-block;
  vertical-align: middle;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<style scoped>
/* Container */
.container {
  width: 100%;
  max-width: 600px;
  padding: 2rem;
  box-sizing: border-box;
  text-align: center;
}

/* Podcast Form Styling */
.podcast-form {
  background-color: var(--form-background); /* Dark form background */
  color: var(--text-color);              /* White text */
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
  margin-bottom: 2rem;
}

/* Form Sections */
.form-section {
  margin-bottom: 1.5rem;
  text-align: left;
}

/* Section Titles */
.section-title {
  font-size: 1.2em;
  margin-bottom: 0.5rem;
  border-bottom: 2px solid #333333;
  padding-bottom: 0.3rem;
}

/* Form Group */
.form-group {
  display: flex;
  flex-direction: column;
}

/* Input Field */
.form-control {
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border-radius: 4px;
  border: 1px solid var(--input-border);
  background-color: var(--input-background);
  color: var(--text-color);
  transition: border-color 0.3s, background-color 0.3s;
}

.form-control:focus {
  border-color: var(--button-background); /* DodgerBlue focus */
  outline: none;
  background-color: #3a3a3a;
}

/* Options Group (Radio Buttons) */
.options-group {
  display: flex;
  flex-direction: column;
}

/* Option Label */
.option-label {
  display: flex;
  align-items: center;
  margin-bottom: 0.6rem;
  cursor: pointer;
  position: relative;
  padding-left: 2rem;
  user-select: none;
  font-size: 1rem;
}

.option-label:last-child {
  margin-bottom: 0;
}

/* Radio Input */
.option-label input[type="radio"] {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  cursor: pointer;
}

/* Custom Radio Button */
.radio-custom {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 18px;
  width: 18px;
  background-color: var(--option-background);
  border-radius: 50%;
  transition: background-color 0.3s, border 0.3s;
}

/* Checked Radio */
.option-label input[type="radio"]:checked ~ .radio-custom {
  background-color: var(--option-checked);
  border: 2px solid var(--text-color);
}

/* Hover Radio */
.option-label:hover .radio-custom {
  background-color: var(--option-hover);
}

/* Generate Button */
.generate-button {
  background-color: var(--button-background); /* DodgerBlue */
  color: var(--text-color);
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1.1em;
  border: none;
  border-radius: 4px;
  transition: background-color 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.generate-button:hover:not(:disabled) {
  background-color: var(--button-hover); /* Slightly darker blue */
}

.generate-button:disabled {
  background-color: var(--button-disabled); /* Gray */
  cursor: not-allowed;
}

/* Status Message */
.status-message {
  margin-top: 1rem;
  font-weight: bold;
  color: var(--status-color);
}

/* Audio Player */
.audio-player {
  margin-top: 2rem;
  background-color: var(--form-background);
  padding: 1.5rem;
  border-radius: 8px;
  color: var(--text-color);
}

.audio-player h2 {
  margin-bottom: 1rem;
}

/* Download Button */
.download-btn {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.6rem 1.2rem;
  background-color: var(--download-button-background); /* Green */
  color: white;
  text-decoration: none;
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.download-btn:hover {
  background-color: var(--download-button-hover); /* Darker Green */
}

/* Responsive Design */
@media (max-width: 600px) {
  .podcast-form {
    padding: 1.5rem;
  }

  .generate-button {
    font-size: 1em;
    padding: 0.6rem;
  }

  .download-btn {
    padding: 0.5rem 1rem;
  }
}
</style>
