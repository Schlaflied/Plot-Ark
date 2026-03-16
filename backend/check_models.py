<<<<<<< HEAD
# -*- coding: utf-8 -*-

# -----------------------------------------------------------------------------
# 文件名: check_models.py
# 作者: Gemini (为你和Syna的梦想助力!)
# 描述: 这个脚本的唯一目的，就是列出你的API Key当前可以使用的所有AI模型。
#       这可以帮助我们找到那个正确的模型名称。
# 版本: 1.0
# -----------------------------------------------------------------------------

import os
import google.generativeai as genai
from dotenv import load_dotenv

# 加载 .env 文件中的环境变量
load_dotenv()

# 从环境变量中获取你的API密钥
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("API key not found. Please check your .env file.")

# 使用密钥配置Gemini API
genai.configure(api_key=api_key)

print("--- Checking for available models... ---")

# 循环遍历所有可用的模型
for m in genai.list_models():
  # 我们只关心支持 'generateContent' 方法的模型，因为这是我们需要的核心功能
  if 'generateContent' in m.supported_generation_methods:
    print(f"✅ Model found: {m.name}")

print("\n--- Check complete. ---")
print("Please copy the full output above and send it back.")
print("请复制上面的所有输出信息，然后发给我。")

=======
# -*- coding: utf-8 -*-

# -----------------------------------------------------------------------------
# 文件名: check_models.py
# 作者: Gemini (为你和Syna的梦想助力!)
# 描述: 这个脚本的唯一目的，就是列出你的API Key当前可以使用的所有AI模型。
#       这可以帮助我们找到那个正确的模型名称。
# 版本: 1.0
# -----------------------------------------------------------------------------

import os
import google.generativeai as genai
from dotenv import load_dotenv

# 加载 .env 文件中的环境变量
load_dotenv()

# 从环境变量中获取你的API密钥
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("API key not found. Please check your .env file.")

# 使用密钥配置Gemini API
genai.configure(api_key=api_key)

print("--- Checking for available models... ---")

# 循环遍历所有可用的模型
for m in genai.list_models():
  # 我们只关心支持 'generateContent' 方法的模型，因为这是我们需要的核心功能
  if 'generateContent' in m.supported_generation_methods:
    print(f"✅ Model found: {m.name}")

print("\n--- Check complete. ---")
print("Please copy the full output above and send it back.")
print("请复制上面的所有输出信息，然后发给我。")

>>>>>>> b4717f651e9b1d19e2f45523066618b1d2bb0c85
