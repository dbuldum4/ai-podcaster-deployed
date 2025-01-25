#AIzaSyD-crAs6xwCimaWQZZiQR5LAKGgHZHOERM
import google.generativeai as genai

genai.configure(api_key="AIzaSyD-crAs6xwCimaWQZZiQR5LAKGgHZHOERM")
model = genai.GenerativeModel("gemini-1.5-flash")
response = model.generate_content("Explain how AI works")
print(response.text)

