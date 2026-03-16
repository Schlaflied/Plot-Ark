# ⛵ 剧情方舟 (Plot Ark) - 最终后端 / Final Backend

这是一个为“剧情方舟”项目打造的最终、强化的 AI 后端服务。它利用 Google Gemini API 的强大能力，专注于深度叙事分析和内容生成。

This is the final, hardened AI backend service for the 'Plot Ark' project. It leverages the power of the Google Gemini API, focusing on deep narrative analysis and content generation.

## 核心功能 / Core Features

* **深度叙事分析与生成 / Deep Narrative Analysis & Generation:** 使用 **Google Gemini API** 进行复杂的剧情分析和创意文本生成。/ Utilizes the Google Gemini API for complex plot analysis and creative text generation.
* **健康与模型验证 / Health & Model Validation:** 提供专门的端点来验证服务的可用性以及所配置的 Gemini 模型是否有效。/ Provides dedicated endpoints to verify service availability and check the validity of the configured Gemini model.
* **生产级部署 / Production-Ready Deployment:** 使用 Docker 和 Gunicorn 进行容器化，并针对云平台（如 Google Cloud Run）进行了优化。/ Containerized using Docker and Gunicorn, optimized for cloud platforms.

## 技术栈 / Tech Stack

| 模块 / Module | 组件 / Component | 描述 / Description |
| :--- | :--- | :--- |
| **框架 / Framework** | Python, Flask | 轻量级的 Python Web 框架。/ Lightweight Python web framework. |
| **AI 引擎 / AI Engine** | `google-generativeai` | 用于调用 Gemini API。/ Used for calling the Gemini API. |
| **部署 / Deployment** | Docker, Gunicorn, Cloud Build | 容器化部署和持续集成。/ Containerized deployment and CI/CD. |
| **依赖管理 / Dependencies**| `python-dotenv` | 用于管理环境变量和密钥。/ Used for managing environment variables and secrets. |

## API 端点 / API Endpoints

| 方法 / Method | 路径 / Path | 描述 / Description |
| :--- | :--- | :--- |
| `GET` | `/` | Health Check (服务状态检查). / Checks the service health status. |
| `POST` | `/process` | 核心处理接口。用于提交数据进行 AI 分析和生成。/ Core endpoint for submitting data for AI analysis and generation. |
| `GET` | `/check_models` | 检查配置的 Gemini 模型是否有效和可用。/ Checks if the configured Gemini model is valid and available. |

## 部署配置 / Deployment Configuration

项目需要以下环境变量才能正常运行。/ The project requires the following environment variables to run correctly.

| 变量名 / Variable Name | 描述 / Description |
| :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API 密钥。/ Google Gemini API Key. |
| `GEMINI_MODEL_NAME` | 要使用的 Gemini 模型名称（例如 `gemini-2.5-flash`）。/ The Gemini model name to be used. |
| `PORT` | 服务监听端口（如 `8080`），通常由云平台自动注入。/ The service listening port, usually injected automatically by the cloud platform. |
