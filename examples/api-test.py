
# import os
# from dotenv import load_dotenv
# from google import genai


# client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


# resp = client.models.generate_content(
#     model="gemini-1.5-flash",
#     contents="Give me 3 ideas for an AI startup."
# )
# print(resp.text)

#unavailable
from openai import OpenAI

client = OpenAI(
    api_key="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", 
    base_url="https://openrouter.ai/api/v1"
)
while True:

    print("Please input something: ")
    user_input = input()
    response = client.chat.completions.create(
        model="deepseek/deepseek-chat",
        messages=[
            {"role": "user", "content": f"{user_input}"}
        ]
    )

    print(response.choices[0].message.content)
# First: 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
# Second: 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