<template>
  <div class="main-container">
    <div class="left-panel">
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

        <!-- Choose a Length Section (Slider) -->
        <div class="form-section">
          <h2 class="section-title">Choose Length (Minutes)</h2>
          <div class="form-group">
            <input
              type="range"
              min="1"
              max="30"
              v-model="podcastLength"
              class="slider-control"
            />
            <span class="length-display">{{ podcastLength }} minute(s)</span>
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
            <!-- New Personas Added Below -->
            <label class="option-label">
              <input type="radio" v-model="selectedPersona" value="comedian" />
              <span class="radio-custom"></span>
              Comedian
            </label>
            <label class="option-label">
              <input type="radio" v-model="selectedPersona" value="journalist" />
              <span class="radio-custom"></span>
              Journalist
            </label>
            <label class="option-label">
              <input type="radio" v-model="selectedPersona" value="tutor" />
              <span class="radio-custom"></span>
              Tutor
            </label>
            <!-- End of New Personas -->
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
    <div class="right-panel">
      <div class="background--custom">
        <canvas id="canvas" />
      </div>
      <h1>AI Podcaster</h1>
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
      podcastLength: 10,         // Default length in minutes
      selectedVoice: null,       // User-selected voice
      selectedPersona: 'trump',  // Default selection

      // Persona Styles Mapping
      personaStyles: {
        trump: "Donald Trump",
        professor: "a knowledgeable professor",
        best_friend: "a friendly best friend",
        comedian: "a witty comedian",
        journalist: "a professional journalist",
        tutor: "an experienced tutor",
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
    
    // Add script dynamically
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/greentfrapp/pocoloco@minigl/minigl.js';
    script.onload = () => {
      const gradient = new Gradient();
      gradient.initGradient("#canvas");
    };
    document.head.appendChild(script);
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
        await this.deleteAllFiles();

        if (!this.podcastTopic.trim()) {
          throw new Error("Please enter a topic for your podcast.");
        }

        if (!this.selectedVoice) {
          throw new Error("Please select a voice for your podcast.");
        }

        if (!this.selectedPersona) {
          throw new Error("Please select a persona for your podcast.");
        }

        this.status = 'Generating content with Gemini...';
        const personaStyle = this.personaStyles[this.selectedPersona] || "Donald Trump";
        const userPrompt = `You are tasked with creating a podcast script about a given topic. The script should be designed to fill a specific duration and adopt a particular persona style. Here are the details:

<podcastLength>
${this.podcastLength}
</podcastLength>

<podcastTopic>
${this.podcastTopic}
</podcastTopic>

<personaStyle>
${personaStyle}
</personaStyle>

Follow these guidelines to create the podcast script:

1. Structure:
   - Create an engaging opening that introduces the topic.
   - Divide the content into 3-5 main points or sections.
   - Conclude with a summary and, if appropriate, a call-to-action.

2. Timing:
   - The script should be designed to fill exactly podcastLength minutes when read aloud at a natural pace.
   - Aim for approximately 250 words per minute of podcast length. Do not underestimate the length. 

3. Persona Style:
   - Adapt your writing style to match the personaStyle specified.
   - Consider the vocabulary, tone, and pacing that would be characteristic of this style.
   - Maintain consistency in the chosen persona throughout the script.

4. Content:
   - Research and present accurate, engaging information about the podcastTopic.
   - Include relevant facts, anecdotes, or examples to illustrate your points.
   - If appropriate, address potential questions or counterarguments related to the topic.

5. Language and Tone:
   - Use clear, conversational language suitable for audio content.
   - Avoid complex jargon unless it's essential to the topic and explain any technical terms.
   - Incorporate rhetorical devices like analogies or metaphors to make the content more engaging.

6. Audience Engagement:
   - Write as if you're speaking directly to a listener.
   - Use rhetorical questions or thought-provoking statements to maintain interest.

Remember, do not include any sound effects, introduction music cues, or non-verbal elements. The script should consist purely of spoken content.

Output your script directly, without any additional text, placeholders, or reference lines. The entire output should be the script itself, ready to be read aloud.

Begin your script now:`;

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
/* Import Inter Font */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');

/* Updated Color Variables */
:root {
  --background-color: #121212;
  --text-color: #ffffff;
  --input-background: #2c2c2c;
  --input-border: #444444;
  --button-background: #1e90ff;
  --button-hover: #1c86ee;
  --button-disabled: #6c757d;
  --option-background: #555555;
  --option-hover: #666666;
  --option-checked: #1e90ff;
  --status-color: #ffffff;
  --download-button-background: #28a745;
  --download-button-hover: #218838;
}

/* Reset and Layout */
* {
  box-sizing: border-box;
}

body, html, #app, .main-container {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Inter', sans-serif;
}

.main-container {
  display: flex;
  height: 100vh;
  width: 100%;
}

/* Left Panel - Simplified */
.left-panel {
  width: 50%;
  background: #1a1a1a;
  padding: 40px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* Right Panel - Update positioning */
.right-panel {
  width: 50%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;  /* Add this to contain the background */
  background: #000;  /* Keep black background */
}

/* Update the background container positioning */
.background--custom {
  width: 100%;
  height: 100%;
  position: absolute;
  overflow: hidden;
  z-index: 0;       /* behind the text but above background */
  top: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Update canvas positioning and size */
canvas#canvas {
  z-index: 0;
  position: absolute;
  min-width: 150%;  /* Make it larger than container */
  min-height: 150%; /* Make it larger than container */
  aspect-ratio: 1;  /* Maintain square aspect ratio */
  object-fit: cover;
  transform: none;
  --gradient-color-1: #F52DA5; 
  --gradient-color-2: #2626FF; 
  --gradient-color-3: #6A2FFF;  
  --gradient-color-4: #00093B;
  --gradient-speed: 0.000002;
}

.right-panel h1 {
  color: white;
  font-size: 2.5rem;
  position: relative;
  z-index: 1; /* keep text above the gradient */
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5); 
}

/* Form Styling - Flat design */
.podcast-form {
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
}

.form-section {
  margin-bottom: 2rem;
}

.section-title {
  color: #fff;
  font-size: 1.2rem;
  margin-bottom: 1rem;
  font-weight: 600;
}

.form-control {
  width: 100%;
  padding: 12px 16px;
  background: #2d2d2d;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  color: white;
  font-size: 1rem;
  margin-bottom: 1rem;
}

.form-control:focus {
  outline: none;
  border-color: #1e90ff;
  box-shadow: 0 0 0 2px rgba(30, 144, 255, 0.2);
}

/* Slider styling (optional, minimal example) */
.slider-control {
  width: 100%;
  margin: 0.5rem 0;
}

/* Length Display Styling */
.length-display {
  color: white;
  font-size: 1rem;
  margin-top: 0.5rem;
}

/* Updated Radio Button Styles */
.options-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-label {
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
  cursor: pointer;
}

/* Hide native radio input completely */
input[type="radio"] {
  position: absolute;
  opacity: 0;
  height: 0;
  width: 0;
}

/* Custom radio circle */
.radio-custom {
  display: block;
  width: 20px;
  height: 20px;
  border: 2px solid #555;
  border-radius: 50%;
  position: relative;
  transition: all 0.2s ease;
}

/* Checked state */
input[type="radio"]:checked + .radio-custom {
  border-color: #1e90ff;
  background: #1e90ff;
  box-shadow: inset 0 0 0 3px #1a1a1a;
}

/* Hover state */
.option-label:hover .radio-custom {
  border-color: #666;
}

.generate-button {
  background: #1e90ff;
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: background 0.2s ease;
}

.generate-button:hover {
  background: #1c86ee;
}

.generate-button:disabled {
  background: #4a4a4a;
  cursor: not-allowed;
}

.audio-player {
  margin-top: 2rem;
  color: white;
}

.audio-player h2 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
}

.download-btn {
  display: inline-block;
  padding: 8px 16px;
  background: #28a745;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  margin-top: 1rem;
}

.status-message {
  color: #fff;
  margin-top: 1rem;
  font-size: 0.9rem;
}

/* Responsive Design */
@media (max-width: 768px) {
  .main-container {
    flex-direction: column;
  }
  
  .left-panel,
  .right-panel {
    width: 100%;
    height: auto;
  }
  
  .right-panel {
    padding: 2rem;
  }
  
  .left-panel {
    padding: 2rem;
  }
  
  .section-title {
    font-size: 1.1rem;
  }
  
  .form-control {
    padding: 10px 14px;
    font-size: 0.95rem;
  }
  
  .generate-button {
    padding: 12px 20px;
    font-size: 0.95rem;
  }
  
  .right-panel h1 {
    font-size: 2rem;
  }
}

/* Gradient Background */
.gradient-background {
  background: linear-gradient(300deg, deepskyblue, darkviolet, blue);
  background-size: 180% 180%;
  animation: gradient-animation 18s ease infinite;
}

@keyframes gradient-animation {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

/* Custom Gradient Background */
.background--custom {
  background-color: #FFFFFF;
  width: 100%;
  height: 100%;
  position: absolute;
  overflow: hidden;
  z-index: 0;
  top: 0;
  left: 0;
}

canvas#canvas {
  z-index: 0;
  position: absolute;
  width: 100%;
  height: 100%;
  transform: none;
  --gradient-color-1: #F52DA5; 
  --gradient-color-2: #2626FF; 
  --gradient-color-3: #6A2FFF;  
  --gradient-color-4: #00093B;
  --gradient-speed: 0.000002;
}
</style>