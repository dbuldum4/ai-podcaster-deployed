from google.cloud import texttospeech

# disclaimer i got this from the documentation
def tts_engine(script):
  client = texttospeech.TextToSpeechClient()

  synthesis_input = texttospeech.SynthesisInput(text=script);

  voice = texttospeech.VoiceSelectionParams(
  language_code="en-IN", name="en-IN-Standard-F", ssml_gender=texttospeech.SsmlVoiceGender.MALE)

  audio_config = texttospeech.AudioConfig(
  audio_encoding=texttospeech.AudioEncoding.MP3)

  response = client.synthesize_speech(
  input=synthesis_input, voice=voice, audio_config=audio_config)

  with open("output.mp3", "wb") as out:
    out.write(response.audio_content)
    print('Audio content written to file "output.mp3"')




