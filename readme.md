# Microsoft Learn - Agent Quickstart

This repository contains exercises and supporting files for the Microsoft Learn Agent Quickstart labs. It demonstrates how to build and interact with AI agents using Microsoft Foundry.

## Prerequisites

- Azure subscription
- Python 3.9 or higher
- Azure CLI installed and authenticated
- VS Code with Python extension (recommended)

## Project Structure

- **computer-history-client/** - A Flask web application that serves as a client for interacting with the Foundry agent
  - `agent_client.py` - Core client logic for connecting to and communicating with the agent
  - `app.py` - Flask application server
  - `requirements.txt` - Python dependencies
  - `static/` - CSS and JavaScript assets
  - `templates/` - HTML templates
  
- **Instructions/** - Lab instructions and media
  - `Labs/` - Step-by-step guides for completing the exercises
  - `media/` - Images and other supporting media

## Getting Started

1. Clone this repository
2. Create a virtual environment: `python -m venv venv`
3. Activate the virtual environment:
   - macOS/Linux: `source venv/bin/activate`
   - Windows: `venv\Scripts\activate`
4. Install dependencies: `pip install -r computer-history-client/requirements.txt`
5. Set up your environment variables (create a `.env` file with required Azure credentials)
6. Run the Flask app: `python computer-history-client/app.py`

## Labs

Follow the labs in `Instructions/Labs/` to:
1. Set up your environment and Foundry agent
2. Create and deploy your agent in Foundry
3. Implement the client application
4. Test your agent with the web interface

> **Note**: The labs in this repo require an Azure subscription.
