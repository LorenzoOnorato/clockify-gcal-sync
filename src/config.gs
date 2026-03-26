/*************************************************
 * config.gs
 * Global settings and mappings
 *************************************************/

// Get Script Properties once and reuse
const SCRIPT_PROPS = PropertiesService.getScriptProperties();

/**
 * Clockify API key is stored in script properties, NOT in code.
 * Set it in: Project Settings -> Script properties -> Add property
 *   Name: CLOCKIFY_API_KEY
 *   Value: your real key
 */
const CLOCKIFY_API_KEY = SCRIPT_PROPS.getProperty('YOUR_API_KEY');

// Workspace ID is not secret, ok to hard-code
const CLOCKIFY_WORKSPACE_ID = '68daf416e9013552ea0d69b5';

// Project name -> Google Calendar ID
const PROJECT_TO_CALENDAR = {
  'Training':     'YOUR_CALENDAR_ID@group.calendar.google.com',
  'Work':         'YOUR_CALENDAR_ID@group.calendar.google.com',
  'Social':       'YOUR_CALENDAR_ID@group.calendar.google.com',
};

// Default calendar if project name not in map
const DEFAULT_CALENDAR_ID = 'YOUR_CALENDAR_EMAIL';

// Marker used inside event descriptions to link to Clockify entries
const CLOCKIFY_MARKER = 'Clockify ID: ';

// Milliseconds in a day – handy utility
const DAY_MS = 24 * 60 * 60 * 1000;

// How far around "now" we sync Calendar -> Clockify.
const CAL_SYNC_UNIQUE_WINDOW= 7

const CAL_SYNC_LOOKBACK_DAYS  = CAL_SYNC_UNIQUE_WINDOW;  // past
const CAL_SYNC_LOOKAHEAD_DAYS = CAL_SYNC_UNIQUE_WINDOW;  // future

// For findExistingEventByClockifyId (update branch)
const FIND_EVENT_DAYS_BEFORE = CAL_SYNC_UNIQUE_WINDOW;  // how many days back from entry.start
const FIND_EVENT_DAYS_AFTER  = CAL_SYNC_UNIQUE_WINDOW;  // how many days after entry.end

// For deleteCalendarEventsByClockifyId (delete branch)
const DELETE_EVENT_DAYS_BEFORE = CAL_SYNC_UNIQUE_WINDOW;  // how many days back from "now"
const DELETE_EVENT_DAYS_AFTER  = CAL_SYNC_UNIQUE_WINDOW;  // how many days forward from "now"

// Master switch: turn all colouring on/off if you ever want to.
const ENABLE_EVENT_COLOURS = true;

// Task keyword -> colour ID (1..11)
/*
 * Google Calendar event colours (1..11):
 * 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana,
 * 6=Tangerine, 7=Peacock, 8=Graphite, 9=Blueberry,
 * 10=Basil, 11=Tomato
 */
const TASK_KEYWORD_TO_COLOR = {
  'YOUR_KEYWORD': '9',
};

/**
 * OPTIONAL: tag keyword → color overrides.
 * If any tag contains one of these keywords (case-insensitive),
 * this colour wins over task/project colours.
 */
const TAG_KEYWORD_TO_COLOR = {
  // examples, tweak as you like:
  'youtube': '11',
};

// Project -> colour ID, or `null` to explicitly keep calendar’s default,
// or just omit the key entirely if you want only task-based colours.
const PROJECT_TO_COLOR = {
  'Training':     null,
  'Productive':   null,
  'Social':       null,
  'SleepEatRest': null,
  'Chores':       null,
};

// === Logging config ===
const LOG_SPREADSHEET_ID = '1UXqiaXqheaPcOj5W-m1lgP6R4MOfEYhqM20AGe5U5GM';
const LOG_SHEET_NAME     = 'Log';