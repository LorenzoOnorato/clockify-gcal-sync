# ClockifyGCSync

Lightweight Google Apps Script integration that syncs Clockify time entries to Google Calendar through webhooks, while also supporting a reverse Google Calendar → Clockify flow for selected calendar events.

This project was built as a practical personal automation: Clockify is my preferred tool for time tracking and analysis, while Google Calendar is my preferred long-term calendar and record system. The goal was to connect both using a free, serverless, low-maintenance solution that could run without relying on a local machine.

## Overview

ClockifyGCSync primarily listens for Clockify webhook events and mirrors tracked time entries into Google Calendar. It supports entry creation, updates, and deletion, allowing tracked work to appear automatically in a calendar environment that is easier to organize, format, share, and preserve over time.

In addition, the project includes a reverse synchronization path from Google Calendar back to Clockify. This makes it possible to create Clockify entries from selected calendar events that do not yet contain a Clockify ID marker.

Beyond simple synchronization, the project also allows customization of event title structure, color coding, and routing entries to different calendars depending on project or category rules.

This was also a small hands-on project to explore APIs, webhooks, triggers, and lightweight automation in a real workflow.

## Why I built it

I wanted a lightweight solution that could:

- run on a free platform
- avoid the need for a local server or always-on machine
- keep Clockify as the main tracking tool
- store tracked data in Google Calendar, which I use as my main long-term calendar system

Using Google Calendar as the destination brings several advantages for my workflow:

- easier sharing of selected calendars or subsets of events
- more control over event formatting and presentation
- a familiar interface for reviewing time allocation over the long term
- a practical personal database for time-tracking history

Google Apps Script was therefore a good fit: serverless, integrated with Google Calendar, lightweight, and fast enough for this use case.

## What it does

The current workflow includes two directions of synchronization.

### Clockify → Google Calendar

The webhook-based flow handles the following actions executed on Clockify:

- creation of entries, including manual entries and timer-based tracking
- updates to existing entries, including project, task, tags, and content changes
- deletion of entries

### Google Calendar → Clockify

A time-driven Apps Script function scans selected Google Calendar events and creates Clockify entries for events that do not yet contain a Clockify ID marker.

This reverse path is useful for maintaining compatibility between calendar planning and time tracking, while avoiding duplicate creation for already-synced entries.

The sync is designed to stay lightweight, with typical update times below a few seconds for the Clockify-triggered path.

## Architecture

Main webhook flow:

**Clockify webhook → Google Apps Script (`doPost`) → event parsing and routing → Google Calendar search / create / update / delete**

Reverse scheduled flow:

**Google Calendar events → time-driven Apps Script trigger → filter events without Clockify marker → Clockify entry creation**

The script identifies matching calendar events using the Clockify entry ID, then applies the appropriate action depending on the webhook event and the mapped calendar rules.

## Key features

- **Serverless deployment** using Google Apps Script
- **Free and lightweight architecture** with no local server required
- **Fast update cycle**, usually within a few seconds
- **Custom event formatting** for clearer calendar display
- **Calendar routing** to assign entries to different Google Calendars
- **Color and structure customization** to better reflect projects or activity types
- **Clockify ID-based matching** to keep updates linked to the correct calendar event
- **Reverse compatibility flow** from Google Calendar to Clockify for selected unsynced events

## Technical notes

This project was designed as a practical integration rather than as a full-scale product. The focus was on simplicity, low maintenance, and usefulness in a real personal workflow.

The most important design choices were:

- using Google Apps Script to avoid maintaining infrastructure
- using webhooks for near-real-time updates
- using time-driven triggers for reverse synchronization
- storing configuration separately from core logic where possible
- keeping event generation customizable for readability and personal use

## Setup

Basic setup requires:

1. A Google Apps Script project
2. Access to Google Calendar
3. A Clockify API key from the desired Clockify workspace
4. Clockify webhook configuration pointing to the Apps Script web app endpoint
5. Script properties and calendar mappings configured in the project
6. An Apps Script time-driven trigger for the Google Calendar → Clockify sync, if the reverse flow is enabled

In this public version, private configuration values have been removed or replaced with placeholders.

## Limitations

This project works well for normal day-to-day usage, but there are some known limitations.

When Clockify is connected directly to Google Apps Script, webhook retries and multiple rapid successive changes can sometimes create ordering issues. In those cases, the wrong update may be processed last, especially if several edits are made quickly on the same entry.

A more robust workaround can be introduced by adding an intermediate webhook receiver and forwarder, for example through n8n, but that changes the nature of the project by adding infrastructure and moving away from the original goal of keeping the system fully free and serverless.

The reverse Google Calendar → Clockify flow also depends on event filtering rules and marker-based deduplication being configured carefully.

## Privacy and publication notes

This repository is published as a cleaned showcase version.

- secrets and private configuration have been removed
- API keys, calendar IDs, and webhook-specific private values are not included
- some screenshots may still contain personal usage examples for demonstration purposes

## Screenshots

Planned additions:

- Clockify entry example
- corresponding Google Calendar event after sync

## Project context

This project sits within a broader personal productivity workflow and a personal experiment in studying time distribution. The goal was not only automation for its own sake, but also building a simple system for reflecting on how time is actually allocated across projects and activities.

## Development note

The project was developed with AI-assisted coding support, while the overall idea, workflow design, planning, testing, iteration, and reliability improvements were driven by the project needs and hands-on debugging.

## Contact

If you would like to discuss the project, give feedback, or ask about the implementation, [LinkedIn](https://www.linkedin.com/in/lorenzo-onorato) is the fastest way to reach me.