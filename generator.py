import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("GEMINI_KEY")

import google.generativeai as genai
from tts import tts_engine

def gen(prompt):
  genai.configure(api_key=key)
  model = genai.GenerativeModel("gemini-1.5-flash")
  response = model.generate_content(prompt)
  text = response.text
  tts_engine(text)

