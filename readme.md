# Computer History Client

A web-based AI agent client built with Flask that connects to a Microsoft Foundry agent for interactive conversations about computer history.

## Features

- Interactive chat interface with an AI agent
- Real-time conversation history management
- Azure-authenticated agent communication
- Responsive web UI with CSS styling
- Python-based backend with Flask

## Prerequisites

- Azure subscription
- Python 3.9 or higher
- Access to a deployed Foundry agent
- Azure credentials configured locally

## Project Structure

- **computer-history-client/** - Main application directory
  - `agent_client.py` - Client logic for connecting to the Foundry agent API
  - `app.py` - Flask web server and routing
  - `requirements.txt` - Python dependencies
  - `static/` - CSS and JavaScript assets for the web UI
  - `templates/` - HTML templates

## Installation & Setup

1. Clone this repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   - macOS/Linux: `source venv/bin/activate`
   - Windows: `venv\Scripts\activate`

4. Install dependencies:
   ```bash
   pip install -r computer-history-client/requirements.txt
   ```

5. Set up your environment variables in a `.env` file:
   ```
   AGENT_ENDPOINT=<your-foundry-agent-endpoint>
   ```

6. Run the application:
   ```bash
   python computer-history-client/app.py
   ```

7. Open your browser to `http://localhost:5000` and start chatting with the agent

## How It Works

The application maintains a conversation history with your Foundry agent, keeping the last 3 exchanges to provide context for multi-turn conversations. Responses are handled asynchronously for a smooth user experience.
