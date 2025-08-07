import { App, LogLevel } from "@slack/bolt";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

// Load environment variables
dotenv.config();

// Initialize the app with your bot token and webhook handler
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Webhook mode - no socket mode or app token needed
  port: Number(process.env.PORT) || 3000,
  logLevel: LogLevel.DEBUG,
});

// Listen for app mentions
app.event("app_mention", async ({ event, client, say }) => {
  console.log("🎯 APP_MENTION EVENT HANDLER TRIGGERED!");
  console.log("Event details:", JSON.stringify(event, null, 2));

  try {
    console.log(
      `Bot was mentioned by ${event.user} in channel ${event.channel}`
    );

    // Check if the mention is in a thread or not
    if (!event.thread_ts) {
      // Not in a thread - show helpful message
      console.log("📢 Mention was NOT in a thread");
      await say({
        text: "To use thread saver @ mention me at the end of a long thread",
        thread_ts: event.ts, // Reply as a thread to their message
      });
      return;
    }

    // We're in a thread - save the thread!
    console.log("🧵 Mention was in a thread - fetching all messages");

    // Notify user we're processing
    await say({
      text: "💾 Saving thread...",
      thread_ts: event.thread_ts,
    });

    // Fetch all messages in the thread with pagination
    let allMessages: any[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await client.conversations.replies({
        channel: event.channel,
        ts: event.thread_ts,
        limit: 200, // Slack's recommended limit per request
        cursor: cursor,
      });

      if (result.messages && result.messages.length > 0) {
        allMessages = allMessages.concat(result.messages);
      }

      // Check if there are more messages to fetch
      hasMore = result.has_more || false;
      cursor = result.response_metadata?.next_cursor;

      console.log(
        `Fetched ${result.messages?.length || 0} messages, total so far: ${
          allMessages.length
        }`
      );
    }

    if (allMessages.length === 0) {
      await say({
        text: "❌ No messages found in this thread",
        thread_ts: event.thread_ts,
      });
      return;
    }

    console.log(`Found ${allMessages.length} total messages in thread`);

    // Fetch user information for all unique users in the thread
    const userIds = [
      ...new Set(allMessages.map((msg) => msg.user).filter(Boolean)),
    ] as string[];
    const userMap = new Map();

    for (const userId of userIds) {
      if (userId) {
        try {
          const userInfo = await client.users.info({ user: userId });
          if (userInfo.ok && userInfo.user) {
            const displayName =
              userInfo.user.profile?.display_name_normalized ||
              userInfo.user.profile?.real_name_normalized ||
              userInfo.user.profile?.display_name ||
              userInfo.user.profile?.real_name ||
              userInfo.user.real_name ||
              userInfo.user.name ||
              userId;
            userMap.set(userId, displayName);
            console.log(`Mapped user ${userId} to name: ${displayName}`);
          } else {
            userMap.set(userId, userId);
          }
        } catch (error) {
          console.error(`Failed to fetch user info for ${userId}:`, error);
          userMap.set(userId, userId);
        }
      }
    }

    // Fetch channel information
    let channelName = event.channel;
    try {
      const channelInfo = await client.conversations.info({
        channel: event.channel,
      });
      if (channelInfo.ok && channelInfo.channel) {
        channelName = channelInfo.channel.name || event.channel;
      }
    } catch (error) {
      console.error(`Failed to fetch channel info:`, error);
    }

    // Get permalink to the first message
    let permalink = "";
    try {
      const permalinkResult = await client.chat.getPermalink({
        channel: event.channel,
        message_ts: event.thread_ts,
      });
      if (permalinkResult.ok && permalinkResult.permalink) {
        permalink = permalinkResult.permalink;
      }
    } catch (error) {
      console.error(`Failed to fetch permalink:`, error);
    }

    // Format messages as markdown
    let markdown = `# Slack Thread Export\n\n`;
    markdown += `**Channel:** #${channelName}\n`;
    markdown += `**Thread Started:** ${new Date(
      parseFloat(event.thread_ts) * 1000
    ).toLocaleString()}\n`;
    markdown += `**Exported:** ${new Date().toLocaleString()}\n`;
    markdown += `**Total Messages:** ${allMessages.length}\n`;
    if (permalink) {
      markdown += `**Thread Link:** [View in Slack](${permalink})\n`;
    }
    markdown += `\n`;

    // Sort messages chronologically
    const sortedMessages = allMessages.sort(
      (a, b) => parseFloat(a.ts || "0") - parseFloat(b.ts || "0")
    );

    // Add each message to the markdown
    for (const message of sortedMessages) {
      const userName = message.user
        ? userMap.get(message.user) || message.user
        : "Unknown User";

      // Process the message text (handle mentions, links, etc.)
      let messageText = message.text || "";

      // Replace user mentions with readable names
      messageText = messageText.replace(
        /<@([A-Z0-9]+)>/g,
        (_match: string, userId: string) => {
          const name = userMap.get(userId) || userId;
          return `**@${name}**`;
        }
      );

      // Replace channel mentions
      messageText = messageText.replace(
        /<#([A-Z0-9]+)(?:\|([^>]+))?>/g,
        (_match: string, _channelId: string, channelName: string) => {
          return channelName ? `**#${channelName}**` : `**#${_channelId}**`;
        }
      );

      // Replace links
      messageText = messageText.replace(
        /<(https?:\/\/[^|>]+)(?:\|([^>]+))?>/g,
        (_match: string, url: string, text: string) => {
          return text ? `[${text}](${url})` : url;
        }
      );

      // Handle Slack emoji format - convert :emoji: to emoji unicode if possible
      // For now, we'll keep them as-is since they're readable
      // messageText = messageText.replace(/:([a-z0-9_+-]+):/g, ':$1:');

      // Add username with message in compact format
      markdown += `**@${userName}**: ${messageText}\n`;

      // Add file attachments if any
      if (message.files && message.files.length > 0) {
        markdown += `**Attachments:**\n`;
        for (const file of message.files) {
          markdown += `- ${file.name || "Unnamed file"}`;
          if (file.url_private) {
            markdown += ` ([Link](${file.url_private}))`;
          }
          markdown += `\n`;
        }
      }

      // Add reactions if any
      if (message.reactions && message.reactions.length > 0) {
        const reactions = message.reactions
          .map((r: any) => `:${r.name}: (${r.count})`)
          .join(" ");
        markdown += `**Reactions:** ${reactions}\n`;
      }

      markdown += `\n`;
    }

    // Create a filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const filename = `thread_${event.channel}_${timestamp}.md`;

    // Upload the markdown file to Slack
    try {
      const uploadResult = await client.files.uploadV2({
        channel_id: event.channel,
        thread_ts: event.thread_ts,
        filename: filename,
        content: markdown,
        initial_comment: `✅ Thread saved successfully! ${allMessages.length} messages exported`,
      });

      console.log(`✅ Thread uploaded to Slack: ${filename}`);
      console.log("Upload result:", uploadResult);
    } catch (uploadError) {
      console.error("Failed to upload file to Slack:", uploadError);

      // Fallback: save locally and notify user
      const filepath = path.join(process.cwd(), "saved_threads", filename);
      await fs.mkdir(path.join(process.cwd(), "saved_threads"), {
        recursive: true,
      });
      await fs.writeFile(filepath, markdown, "utf-8");

      await say({
        text: `⚠️ Couldn't upload file to Slack, but saved locally.\n📁 File: \`${filename}\`\n📊 ${allMessages.length} messages exported`,
        thread_ts: event.thread_ts,
      });
    }
  } catch (error) {
    console.error("❌ Error handling app mention:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));

    await say({
      text: "❌ Sorry, I encountered an error while saving the thread. Please try again.",
      thread_ts: event.thread_ts || event.ts,
    });
  }
});

// Listen for messages that contain the bot's name (without direct mention)
app.message(async ({ message, say }) => {
  console.log("📨 MESSAGE EVENT received:", {
    type: message.type,
    subtype: message.subtype,
    text: "text" in message ? message.text : "no text",
    user: "user" in message ? message.user : "no user",
  });

  // Type guard to ensure it's a user message
  if (message.subtype === undefined || message.subtype === "bot_message") {
    return;
  }

  // Check if the message contains certain keywords
  const text = "text" in message ? message.text?.toLowerCase() || "" : "";

  if (text.includes("hello bot") || text.includes("hey bot")) {
    console.log("🔍 Detected 'hello bot' or 'hey bot' in message");
    await say({
      text: "Hello! I'm here to help. You can mention me with @bot_name to get my attention.",
      thread_ts: "ts" in message ? message.ts : undefined,
    });
  }

  // Respond to "thread saver" mentions
  if (text.includes("thread saver") || text.includes("thread save")) {
    console.log("🔍 Detected 'thread saver' or 'thread save' in message");
    await say({
      text: "👋 Thread Saver bot here! I can help you save important threads. Use `/thread-save` command or mention me directly!",
      thread_ts: "ts" in message ? message.ts : undefined,
    });
  }
});

// Handle slash commands
app.command("/thread-save", async ({ command, ack, respond }) => {
  // Acknowledge the command request
  await ack();

  try {
    // Respond to the slash command
    await respond({
      text: `Received command from <@${command.user_id}>: ${command.text}`,
      response_type: "ephemeral", // Only visible to the user who invoked the command
    });
  } catch (error) {
    console.error("Error handling slash command:", error);
    await respond({
      text: "Sorry, something went wrong processing your command.",
      response_type: "ephemeral",
    });
  }
});

// Handle interactive components (buttons, select menus, etc.)
app.action("button_click", async ({ body, ack, say }) => {
  await ack();
  if (say) {
    await say(`<@${body.user.id}> clicked the button!`);
  }
});

// Handle webhook events
// This endpoint receives events via webhooks
app.event("message", async ({ event }) => {
  // This will handle all message events via webhooks
  if (event.subtype === undefined || event.subtype === "bot_message") {
    return;
  }

  // Type guard to ensure the event has a text property
  if ("text" in event && typeof event.text === "string") {
    console.log(`Received message event via webhook: ${event.text}`);
  }
});

// Handle view submissions (for modals)
app.view("view_submission", async ({ ack, body, view }) => {
  await ack();

  const user = body.user.id;
  const values = view.state.values;

  console.log(`View submitted by ${user}:`, values);
});

// Error handling
app.error(async (error) => {
  console.error("Global error handler:", error);
});

// Add a generic event listener to log ALL events for debugging
app.event(/.*/, async ({ event }) => {
  console.log("📥 Received ANY Slack event:", {
    type: event.type,
    channel: "channel" in event ? event.channel : "N/A",
    user: "user" in event ? event.user : "N/A",
    text: "text" in event ? (event.text as string).substring(0, 100) : "N/A",
  });
});

// Start the app
(async () => {
  try {
    await app.start();
    console.log("⚡️ Slack app is running in webhook mode!");
    console.log(`🌐 Port: ${process.env.PORT || 3000}`);
    console.log("📡 Ready to receive webhooks from ngrok");

    // Log environment status
    console.log("📋 Environment check:");
    console.log(
      `  - Bot Token: ${process.env.SLACK_BOT_TOKEN ? "✓ Set" : "✗ Missing"}`
    );
    console.log(
      `  - Signing Secret: ${
        process.env.SLACK_SIGNING_SECRET ? "✓ Set" : "✗ Missing"
      }`
    );

    console.log("\n🔗 Next steps:");
    console.log("  1. Start ngrok: ngrok http 3000");
    console.log("  2. Copy the HTTPS URL from ngrok");
    console.log("  3. Update your Slack app settings:");
    console.log(
      "     - Event Subscriptions URL: https://your-ngrok-url.ngrok.io/slack/events"
    );
    console.log(
      "     - Interactivity URL: https://your-ngrok-url.ngrok.io/slack/events"
    );
    console.log(
      "     - Slash Commands URL: https://your-ngrok-url.ngrok.io/slack/events"
    );

    // Test the bot token by getting auth info
    try {
      const authTest = await app.client.auth.test({
        token: process.env.SLACK_BOT_TOKEN,
      });
      console.log("🤖 Bot authenticated as:", {
        botId: authTest.bot_id,
        teamId: authTest.team_id,
        userId: authTest.user_id,
        user: authTest.user,
      });
    } catch (authError) {
      console.error("❌ Bot authentication failed:", authError);
    }
  } catch (error) {
    console.error("Unable to start app:", error);
    process.exit(1);
  }
})();
