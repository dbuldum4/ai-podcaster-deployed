import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("GEMINI_KEY")

print(key)

import google.generativeai as genai

genai.configure(api_key=key)
model = genai.GenerativeModel("gemini-1.5-flash")
response = model.generate_content("Explain how AI works")
print(response.text)

