/*************************************************
 * utils.gs
 * Helper functions used by both directions
 *************************************************/

/**
 * Get calendar ID from project name, or default calendar.
 */
function getCalendarIdForProjectName(projectName) {
  return PROJECT_TO_CALENDAR[projectName] || DEFAULT_CALENDAR_ID;
}

/**
 * Inverse: from calendar ID to project name (for Calendar -> Clockify).
 */
function getProjectNameForCalendarId(calendarId) {
  for (const [name, calId] of Object.entries(PROJECT_TO_CALENDAR)) {
    if (calId === calendarId) return name;
  }
  return null;
}

/**
 * Fetch Clockify projects once and build name -> id cache.
 */
function getProjectIdByName(projectName) {
  if (!PROJECT_NAME_TO_ID_CACHE) {
    PROJECT_NAME_TO_ID_CACHE = {};
    const url =
      `https://api.clockify.me/api/v1/workspaces/${CLOCKIFY_WORKSPACE_ID}/projects`;
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'X-Api-Key': CLOCKIFY_API_KEY },
      muteHttpExceptions: true,
    });
    const projects = JSON.parse(resp.getContentText());
    projects.forEach(p => {
      PROJECT_NAME_TO_ID_CACHE[p.name] = p.id;
    });
  }
  return PROJECT_NAME_TO_ID_CACHE[projectName] || null;
}

/**
 * Build event title like in Make, plus tags in parentheses:
 *
 *  - If task.name exists -> "Task (Tag1, Tag2)"
 *  - Else if only tags   -> "Tag1, Tag2"
 *  - Else                -> empty string
 */
function buildEventTitleFromClockifyEntry(entry) {
  const taskName = entry.task && entry.task.name ? entry.task.name.trim() : '';
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map(t => t.name).filter(Boolean)
    : [];

  if (taskName) {
    if (tags.length > 0) {
      return `${taskName} (${tags.join(', ')})`;
    }
    return taskName;
  }

  if (tags.length > 0) {
    return tags.join(', ');
  }

  return '';
}

/**
 * Build event title, plus tags in parentheses:
 * - If task.name exists -> "Task (Tag1, Tag2)"
 * - Else if only tags -> "Tag1, Tag2"
 * - Else -> empty string
 */
function buildEventDescriptionFromClockifyEntry(entry, projectName, tags, clockifyId) {
  let desc = '';

  // Keep user description (Clockify notes)
  if (entry.description) {
    desc += entry.description;
  }

  // Metadata separator
  desc += '\n\n---\n';

  // Clockify ID
  desc += 'Clockify ID: ' + clockifyId + '\n';

  // Project
  desc += 'Project: ' + projectName + '\n';

  // Task (try task.name, otherwise fallback to title builder)
  let taskName = entry.task && entry.task.name ? entry.task.name : '';
  if (!taskName) {
    const titleLike = buildEventTitleFromClockifyEntry(entry);
    if (titleLike) taskName = titleLike;
  }
  if (taskName) {
    desc += 'Task: ' + taskName + '\n';
  }

  // Tags (optional)
  if (tags && tags.length > 0) {
    desc += 'Tags: ' + tags.join(', ') + '\n';
  }

  return desc.trim();
}


/**
 * From a full event description, extract only the "user" part
 * (everything before the metadata separator '---').
 */
function extractUserDescriptionFromEvent(fullDesc) {
  if (!fullDesc) return '';
  const idx = fullDesc.indexOf('\n---');
  if (idx === -1) return fullDesc.trim();
  return fullDesc.substring(0, idx).trim();
}

/**
 * Determine a colour ID based on task name and keyword map.
 */
function getColorForTask(taskName) {
  if (!taskName) return null;
  const lower = taskName.toLowerCase();
  for (const [keyword, colorId] of Object.entries(TASK_KEYWORD_TO_COLOR)) {
    if (lower.includes(keyword.toLowerCase())) {
      return colorId;
    }
  }
  return null;
}

/**
 * Determine a colour ID based on task name and keyword map.
 */
function getColorForTask(taskName) {
  if (!taskName) return null;
  const lower = taskName.toLowerCase();
  for (const [keyword, colorId] of Object.entries(TASK_KEYWORD_TO_COLOR)) {
    if (lower.includes(keyword.toLowerCase())) {
      return colorId;
    }
  }
  return null;
}

/**
 * Determine a colour ID based on tags and TAG_KEYWORD_TO_COLOR.
 * `tags` is an array of strings (tag names).
 */
function getColorForTags(tags) {
  if (!tags || !tags.length) return null;

  // Normalise to lowercase once
  const lowerTags = tags.map(t => String(t).toLowerCase());

  for (const [keyword, colorId] of Object.entries(TAG_KEYWORD_TO_COLOR)) {
    const kw = keyword.toLowerCase();

    // If ANY tag contains the keyword, return that colour
    if (lowerTags.some(tag => tag.includes(kw))) {
      return colorId;
    }
  }
  return null;
}

/**
 * Apply colour to event based on tags, task name, and project.
 * Priority:
 *  1) Tag keyword colour (TAG_KEYWORD_TO_COLOR)
 *  2) Task keyword colour (TASK_KEYWORD_TO_COLOR)
 *  3) Project-based colour (PROJECT_TO_COLOR)
 * If none match, leave the event's colour unchanged.
 */
function applyColorToEvent(event, taskName, projectName, tags) {
  let colorId = null;

  // 1) tags override
  colorId = getColorForTags(tags);

  // 2) otherwise use task name
  if (!colorId) {
    colorId = getColorForTask(taskName);
  }

  // 3) otherwise project default
  if (!colorId && PROJECT_TO_COLOR[projectName]) {
    colorId = PROJECT_TO_COLOR[projectName];
  }

  // 4) only set if we actually chose something
  if (colorId) {
    event.setColor(colorId);
  }
}


/**
 * Find event in a calendar by Clockify ID.
 * We search from 1 day before the start date to 1 day after,
 * so moving entries by hours still allows us to find them.
 */
function findExistingEventsByClockifyId(calendar, clockifyId, start, end) {
  const windowStart = new Date(start);
  windowStart.setDate(windowStart.getDate() - FIND_EVENT_DAYS_BEFORE);

  const windowEnd = new Date(end);
  windowEnd.setDate(windowEnd.getDate() + FIND_EVENT_DAYS_AFTER);

  const events = calendar.getEvents(windowStart, windowEnd);
  const matches = [];

  for (const ev of events) {
    const desc = ev.getDescription() || '';
    if (desc.indexOf(CLOCKIFY_MARKER + clockifyId) !== -1) {
      matches.push(ev);
    }
  }

  return matches;
}

/*************************************************
 * Simple logging to Google Sheets
 *************************************************/
/**
 * Get (or create) the log sheet.
 */
function getLogSheet() {
  if (!LOG_SPREADSHEET_ID) {
    Logger.log('Sheet logging disabled: LOG_SPREADSHEET_ID not set');
    return null;
  }
  const ss = SpreadsheetApp.openById(LOG_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    // Header row
    sheet.appendRow([
      'Timestamp',
      'Source',
      'EventType',
      'ClockifyId',
      'Project',
      'CalendarId',
      'Action',
      'Details',
    ]);
  }
  return sheet;
}

/**
 * Append one log line to the Sheet.
 * This is wrapped in try/catch so logging NEVER breaks webhooks.
 */
function appendSheetLog(source, evtType, clockifyId, project, calendarId, action, details) {
  try {
    const sheet = getLogSheet();
    if (!sheet) return;  // logging disabled / sheet missing

    sheet.appendRow([
      new Date(),
      source || '',
      evtType || '',
      clockifyId || '',
      project || '',
      calendarId || '',
      action || '',
      details || '',
    ]);
  } catch (err) {
    // Just log to Apps Script logs; don't let this kill the request
    Logger.log('appendSheetLog error: ' + err);
  }
}