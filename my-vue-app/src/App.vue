<template>
  <div id="app" class="container">
    <h1>AI Podcaster</h1>

    <!-- Podcast Form -->
    <form @submit.prevent="generate" class="podcast-form">
      <!-- Topic Input -->
      <div class="form-group mb-3">
        <label for="topic" class="form-label">Podcast Topic</label>
        <input
          id="topic"
          type="text"
          v-model="podcastTopic"
          class="form-control"
          placeholder="Enter a topic (e.g. 'Mindfulness Meditation')"
          required
        />
      </div>

      <!-- Length Selector -->
      <div class="form-group mb-3 length-selector">
        <label class="me-3">
          <input type="radio" v-model="podcastLength" value="short" />
          Short
        </label>
        <label class="me-3">
          <input type="radio" v-model="podcastLength" value="medium" />
          Medium
        </label>
        <label>
          <input type="radio" v-model="podcastLength" value="long" />
          Long
        </label>
      </div>

      <!-- Generate Button -->
      <button
        type="submit"
        :disabled="loading"
        class="button generate-button mb-3"
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
export default {
  name: 'App',
  data() {
    return {
      geminiKey: '',          // Gemini API Key
      ttsKey: '',             // TTS API Key
      quotaProjectId: 'casehack', // Google Cloud project ID
      audioSrc: '',           // Source URL for the audio player
      loading: false,         // Loading state for button and processes
      status: '',             // Status messages for user feedback

      // Podcast form data
      podcastTopic: '',
      podcastLength: 'medium',  // Default to "medium"

      // Used internally to send to Gemini
      userPrompt: '',
    };
  },
  mounted() {
    if (window.CONFIG) {
      this.geminiKey = window.CONFIG.GEMINI_KEY;
      this.ttsKey = window.CONFIG.TTS_KEY;
    } else {
      console.error('API keys are not defined. Please set them in config.js or environment variables.');
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
          language_code: "en-us",
          name: "en-us-Standard-A"
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
      this.status = 'Generating story...';

      try {
        // Delete existing files in the bucket to keep it clean
        await this.deleteAllFiles();

        // Validate form input
        if (!this.podcastTopic.trim()) {
          throw new Error("Please enter a topic for your podcast.");
        }

        // Build a user prompt based on topic and chosen length
        this.userPrompt = `Create a ${this.podcastLength} podcast script about: ${this.podcastTopic}`;

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
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #646cff;
}

button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}

#app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

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

.podcast-form {
  margin-bottom: 2rem;
  text-align: left;
  max-width: 600px;
  margin: 0 auto 2rem auto;
  background-color: #f9f9f9; /* Light background for form */
  padding: 1.5rem;
  border-radius: 8px;
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.form-control {
  width: 100%;
  padding: 0.6rem;
  font-size: 1rem;
  border-radius: 4px;
  border: 1px solid #ccc;
}

.length-selector label {
  font-weight: 500;
  margin-right: 1rem;
  cursor: pointer;
}

.generate-button {
  background-color: #28a745; /* Green */
  color: white;
}

.generate-button:hover:not(:disabled) {
  background-color: #218838; /* Darker Green */
}

.generate-button:disabled {
  background-color: #6c757d; /* Gray */
  cursor: not-allowed;
}

.status-message {
  margin-top: 20px;
  font-weight: bold;
  color: #333;
}

.audio-player {
  margin-top: 20px;
}

.download-btn {
  display: inline-block;
  margin-top: 10px;
  padding: 8px 16px;
  background-color: #007bff; /* Blue */
  color: white;
  text-decoration: none;
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.download-btn:hover {
  background-color: #0056b3; /* Darker Blue */
}

.mb-3 {
  margin-bottom: 1rem;
}

.me-3 {
  margin-right: 1rem;
}
</style>