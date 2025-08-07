# Slack Thread Saver Bot

A TypeScript-based Slack bot that saves important Slack threads as nicely formatted markdown files.

## Features

- 💾 **Thread Saving**: Mention the bot in any thread to save it as a markdown file
- 📋 **Smart Formatting**: Preserves user names, timestamps, reactions, and attachments
- 🤖 **Helpful Guidance**: Provides instructions when mentioned outside of threads
- 💬 Listens for specific keywords in messages
- 🔧 Handles slash commands (`/thread-save`)
- 🎯 Supports interactive components (buttons, modals)
- 🔄 Uses HTTP webhooks with ngrok for local development
- 📝 Full TypeScript support with type safety

## Prerequisites

- Node.js 18+ and npm
- A Slack workspace where you can install apps
- Slack App credentials (see Setup section)

## Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in your Slack credentials:

```bash
cp env.template .env
```

3. Edit `.env` with your Slack app credentials (see Configuration section)

## Usage

### Saving Threads

The Thread Saver bot helps you export important Slack threads as markdown files:

1. **In a Thread**: @ mention the bot at the end of any thread you want to save

   - The bot will fetch all messages in the thread
   - Creates a nicely formatted markdown file with usernames, timestamps, reactions, and attachments
   - Saves the file to the `saved_threads/` directory (automatically created)
   - File naming format: `thread_[channel]_[timestamp].md`

2. **Outside a Thread**: If you @ mention the bot in the main channel
   - The bot will respond with: "To use thread saver @ mention me at the end of a long thread"
   - This helps guide users to use the bot correctly

### Exported File Format

The saved markdown files include:

- Thread metadata (channel, start time, export time, message count)
- Each message with author name and timestamp
- Formatted text with proper @ mentions and links
- File attachments with links
- Emoji reactions with counts
- All messages in chronological order

### File Storage

- Thread exports are saved in the `saved_threads/` directory
- This directory is automatically created if it doesn't exist
- The directory is gitignored by default to prevent accidental commits of saved threads

## Configuration

### Creating a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Give your app a name and select your workspace

### Required Slack App Settings

#### OAuth & Permissions

Navigate to "OAuth & Permissions" and add these bot token scopes:

- `app_mentions:read` - Read messages that mention your app
- `channels:history` - View messages in public channels
- `chat:write` - Send messages
- `commands` - Add slash commands
- `users:read` - Get user information for thread participants
- `groups:history` - View messages in private channels (if needed)
- `im:history` - View direct messages (if needed)
- `mpim:history` - View group direct messages (if needed)

#### Event Subscriptions

1. Enable Events and set your Request URL (for webhook mode)
2. Subscribe to bot events:
   - `app_mention` - When your bot is mentioned
   - `message.channels` - Messages in public channels
   - `message.groups` - Messages in private channels (optional)
   - `message.im` - Direct messages (optional)

#### Webhook Mode with ngrok (For Local Development)

1. Install ngrok: `brew install ngrok` (Mac) or download from [ngrok.com](https://ngrok.com)
2. The app runs in webhook mode by default - no Socket Mode needed
3. Start ngrok to expose your local server (see Development section)

#### Slash Commands (Optional)

Add a slash command:

- Command: `/thread-save`
- Request URL: Your webhook URL + `/slack/commands`
- Short Description: "Save thread conversation"

### Environment Variables

Update your `.env` file with:

```env
# From "Basic Information" page
SLACK_SIGNING_SECRET=your-signing-secret

# From "OAuth & Permissions" page (Bot User OAuth Token)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Server configuration
PORT=3000
NODE_ENV=development
```

**Note:** App-Level Token (`SLACK_APP_TOKEN`) is no longer needed as we use webhook mode with ngrok.

## Development

### Running with ngrok (Local Development)

1. **Start the app** with hot-reload:

```bash
npm run dev
```

2. **In a new terminal**, start ngrok:

```bash
ngrok http 3000
```

3. **Copy the HTTPS URL** from ngrok (e.g., `https://abc123.ngrok-free.app`)

4. **Update your Slack app settings** at [https://api.slack.com/apps](https://api.slack.com/apps):

   - **Event Subscriptions**: Enable and set Request URL to `https://YOUR-NGROK-URL.ngrok-free.app/slack/events`
   - **Interactivity & Shortcuts**: Enable and set Request URL to `https://YOUR-NGROK-URL.ngrok-free.app/slack/events`
   - **Slash Commands**: Update each command's Request URL to `https://YOUR-NGROK-URL.ngrok-free.app/slack/events`

5. **Save and verify** - Slack will send a verification request to your ngrok URL

### Building for Production

```bash
npm run build
npm start
```

### Available Scripts

- `npm run dev` - Start with hot-reload (tsx watch mode)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled JavaScript
- `npm run lint` - Check code with ESLint
- `npm run type-check` - TypeScript type checking without building

## Usage

### Mentioning the Bot

In any channel where the bot is present:

```
@YourBotName hello there!
```

The bot will respond in a thread with your message.

### Using Slash Commands

Type in any channel:

```
/thread-save [your message]
```

### About Webhook Mode

This app runs in **webhook mode** by default, which means:

- It receives events via HTTP POST requests from Slack
- Requires a public HTTPS URL (we use ngrok for local development)
- No Socket Mode or App-Level Token needed
- Same setup works for both development (with ngrok) and production

**For local development**: Use ngrok to tunnel requests to your local server (see instructions above)

**For production**: Deploy to any platform with HTTPS support (Heroku, AWS, etc.) and update the Slack app URLs to your production domain

## Project Structure

```
slack-thread-saver/
├── src/
│   └── index.ts        # Main application file
├── dist/               # Compiled JavaScript (generated)
├── .env                # Environment variables (create from template)
├── env.template        # Environment template
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── .eslintrc.json      # ESLint configuration
└── README.md           # This file
```

## Webhook Endpoints

When running in webhook mode, the app exposes these endpoints:

- `POST /slack/events` - Event subscriptions
- `POST /slack/commands` - Slash commands
- `POST /slack/actions` - Interactive components (buttons, modals)

## Troubleshooting

### Bot doesn't respond to mentions

- Ensure the bot is invited to the channel
- Check that `app_mentions:read` scope is added
- Verify the bot token starts with `xoxb-`

### ngrok connection issues

- Ensure ngrok is running and forwarding to the correct port (3000)
- Verify the ngrok URL is correctly set in Slack app settings
- Remember to update Slack URLs each time you restart ngrok (URL changes)

### Webhook mode not receiving events

- Ensure your server has a public HTTPS URL
- Verify the signing secret is correct
- Check that event subscriptions URL is verified in Slack

## Security Notes

- Never commit your `.env` file to version control
- Keep your signing secret and tokens secure
- Use environment variables for all sensitive data
- Validate and sanitize user input in production

## Resources

- [Slack Bolt Documentation](https://slack.dev/bolt-js)
- [Slack API Documentation](https://api.slack.com)
- [Block Kit Builder](https://app.slack.com/block-kit-builder) - Design rich messages
- [Slack Events API](https://api.slack.com/events-api)

## License

MIT
