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
        <div class="form-group length-selector">
          <label class="length-option">
            <input type="radio" v-model="podcastLength" value="short" />
            <span class="radio-custom"></span>
            Short
          </label>
          <label class="length-option">
            <input type="radio" v-model="podcastLength" value="medium" />
            <span class="radio-custom"></span>
            Medium
          </label>
          <label class="length-option">
            <input type="radio" v-model="podcastLength" value="long" />
            <span class="radio-custom"></span>
            Long
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
      geminiKey: CONFIG.GEMINI_KEY,
      ttsKey: CONFIG.TTS_KEY,
      quotaProjectId: 'casehack', // Google Cloud project ID
      audioSrc: '',               // Source URL for the audio player
      loading: false,             // Loading state for button and processes
      status: '',                 // Status messages for user feedback

      // Podcast form data
      podcastTopic: '',
      podcastLength: 'medium',    // Default to "medium"
      selectedVoice: null,        // User-selected voice

      // List of available voices with accents and genders
      voices: [
        { name: 'en-US-Journey-D', displayName: 'Journey D', languageCode: 'en-US', ssmlGender: 'MALE' },
        { name: 'en-US-Journey-F', displayName: 'Journey F', languageCode: 'en-US', ssmlGender: 'FEMALE' },
        { name: 'en-GB-Journey-D', displayName: 'Journey D', languageCode: 'en-GB', ssmlGender: 'MALE' },
        { name: 'en-GB-Journey-O', displayName: 'Journey O', languageCode: 'en-GB', ssmlGender: 'FEMALE' },
        { name: 'en-AU-Journey-D', displayName: 'Journey D', languageCode: 'en-AU', ssmlGender: 'MALE' },
        { name: 'en-AU-Journey-F', displayName: 'Journey F', languageCode: 'en-AU', ssmlGender: 'FEMALE' },
      ],

      // Used internally to send to Gemini
      userPrompt: '',
    };
  },
  mounted() {
    // No need to check window.CONFIG anymore
    if (!this.geminiKey || !this.ttsKey) {
      console.error('API keys are not defined. Please set them in config.js or environment variables.');
      this.status = 'Error: API keys are not defined.';
    }
  },
  methods: {
    /**
     * Deletes all files from the specified Google Cloud Storage bucket.
     */
    async deleteAllFiles() {
      const accessToken = this.ttsKey;
      const bucketName = 'podcaster-bucket'; // Replace with your bucket name
      
      try {
        this.status = 'Deleting all files...';
        const listResponse = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
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
            `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(item.name)}`, 
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`
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
      const accessToken = this.ttsKey;
      const bucketName = "podcaster-bucket";
      const url = `https://storage.googleapis.com/${bucketName}/${objectName}`;

      try {
        this.status = 'Fetching audio from GCS...';
        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${accessToken}`
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
      const accessToken = this.ttsKey;
      const timestamp = Date.now();
      const objectName = `tts-output-${timestamp}.wav`;
      const outputGcsUri = `gs://podcaster-bucket/${objectName}`;

      const requestBody = {
        parent: "projects/287269128315/locations/global",
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

      try {
        this.status = 'Generating audio...';
        const response = await fetch(
          "https://texttospeech.googleapis.com/v1beta1/projects/287269128315/locations/global:synthesizeLongAudio",
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

        // Build a user prompt based on topic and chosen length
        this.userPrompt = `Create a ${this.podcastLength} podcast script about: ${this.podcastTopic}. You should only output the podcast, no other extra text. There should be no sound effects, or introduction music queues. Only content and text. I also want it in the style of Donald Trump.`;

        // Prepare request body for Gemini
        const requestBody = {
          contents: [
            {
              parts: [{ text: this.userPrompt }]
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
:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}

a:hover {
  color: #535bf2;
}

body {
  margin: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 320px;
  min-height: 100vh;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
  margin-bottom: 1.5rem;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.8em 1.5em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: background-color 0.3s, border-color 0.25s;
}

button:hover {
  border-color: #646cff;
}

button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}

#app {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

/* Light-mode overrides */
@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
  }
  a:hover {
    color: #747bff;
  }
  button {
    background-color: #f9f9f9;
  }
}
</style>

<style scoped>
.container {
  width: 100%;
}

/* Podcast Form Styling */
.podcast-form {
  background-color: #2c2c2c; /* Dark background */
  color: #fff;              /* White text */
  padding: 1.5rem 2rem;     /* Reduced top and bottom padding */
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

/* Form Sections */
.form-section {
  margin-bottom: 1.5rem;
}

/* Section Titles */
.section-title {
  font-size: 1.2em;
  margin-bottom: 0.8rem;
  font-weight: 600;
}

/* Form Group */
.form-group {
  display: flex;
  flex-direction: column;
}

/* Input Field */
.form-control {
  padding: 0.8rem 1rem;
  font-size: 1rem;
  border-radius: 6px;
  border: 1px solid #555;
  background-color: #3a3a3a;
  color: #fff;
  transition: border-color 0.3s, background-color 0.3s;
}

.form-control:focus {
  border-color: #28a745;
  outline: none;
  background-color: #4a4a4a;
}

/* Length Selector */
.length-selector {
  display: flex;
  flex-direction: column;
}

.length-option {
  display: flex;
  align-items: center;
  margin-bottom: 0.6rem;
  cursor: pointer;
  position: relative;
  padding-left: 1.5rem;
  user-select: none;
  font-size: 1rem;
}

.length-option:last-child {
  margin-bottom: 0;
}

.length-option input[type="radio"] {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  cursor: pointer;
}

.length-option .radio-custom {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 16px;
  width: 16px;
  background-color: #555;
  border-radius: 50%;
  transition: background-color 0.3s, border 0.3s;
}

.length-option input[type="radio"]:checked ~ .radio-custom {
  background-color: #28a745;
  border: 2px solid #fff;
}

.length-option:hover .radio-custom {
  background-color: #666;
}

/* Generate Button */
.generate-button {
  background-color: #28a745; /* Green */
  color: white;
  width: 100%;
  padding: 0.8rem;
  font-size: 1.1em;
  border: none;
  border-radius: 6px;
  transition: background-color 0.3s;
}

.generate-button:hover:not(:disabled) {
  background-color: #218838; /* Darker Green */
}

.generate-button:disabled {
  background-color: #6c757d; /* Gray */
  cursor: not-allowed;
}

/* Status Message */
.status-message {
  margin-top: 1rem;
  font-weight: bold;
  color: #fff;
}

/* Audio Player */
.audio-player {
  margin-top: 2rem;
  background-color: #2c2c2c;
  padding: 1.5rem;
  border-radius: 8px;
}

.audio-player h2 {
  margin-bottom: 1rem;
}

.download-btn {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.6rem 1.2rem;
  background-color: #007bff; /* Blue */
  color: white;
  text-decoration: none;
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.download-btn:hover {
  background-color: #0056b3; /* Darker Blue */
}

/* Responsive Adjustments */
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
