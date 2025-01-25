async function speakText(text) {

    const accessToken = window.CONFIG.TTS_KEY; 

    console.log(accessToken);

    const quotaProjectId = "casehack";

    const requestBody = {
    input: {
        text: text
        },
        voice: {
          languageCode: "en-gb",
          name: "en-GB-Standard-A",
          ssmlGender: "FEMALE"
        },
        audioConfig: {
          audioEncoding: "MP3"
        }
    };

    try {
        
        const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer `+accessToken,
            "x-goog-user-project": quotaProjectId
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
  
          const errMsg = await response.text();
          throw new Error(`Error: ${response.status} - ${errMsg}`);
        }


        const data = await response.json();
        const audioContent = data.audioContent;

        if (audioContent) {
          const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
          audio.play().catch(err => console.error("Audio playback error:", err));
        } else {
          console.error("No audioContent received.");
        }
      } catch (error) {
        console.error("TTS request failed:", error);
      }
    }




async function generate() {
    const geminiKey = window.CONFIG.GEMINI_KEY; 
  
    const requestBody = {
      contents: [
        {
          parts: [{ text: "make me a story" }]
        }
      ]
    };
  
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + geminiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
  
    if (!response.ok) {
      const errMsg = await response.text();
      throw new Error(`Error: ${response.status} - ${errMsg}`);
    }
  
    const data = await response.json();
    console.log(data);
  
    const textHolder = document.getElementById("paragraph");


    const outputText = data.candidates[0].content.parts[0].text; 

    speakText(outputText);

  }
  
  document.getElementById("btn").addEventListener("click", generate);
  



