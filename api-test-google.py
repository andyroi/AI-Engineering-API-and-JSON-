from openai import OpenAI
from google import genai
import os

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

resp = client.models.generate_content(
    model = "gemini-2.5-flash",
    contents = "Give me 3 ideas for an AI startup."
)

print(resp.text)
