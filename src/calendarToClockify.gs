/*************************************************
 * calendarToClockify.gs
 * Time-driven sync: Google Calendar -> Clockify
 *************************************************/

// In-memory cache: { 'Project name' : 'clockifyProjectId' }
const PROJECT_NAME_TO_ID_CACHE = {};

/**
 * Time-driven function.
 * Creates Clockify entries for events in project calendars
 * that do NOT yet have a Clockify ID marker.
 */
function syncCalendarToClockify() {
  const now = new Date();

  // Time window: CAL_SYNC_LOOKBACK_DAYS back, CAL_SYNC_LOOKAHEAD_DAYS forward
  const since = new Date(now.getTime() - CAL_SYNC_LOOKBACK_DAYS  * DAY_MS);
  const until = new Date(now.getTime() + CAL_SYNC_LOOKAHEAD_DAYS * DAY_MS);

  const syncCalendarIds = Object.values(PROJECT_TO_CALENDAR);

  // Counters for debugging
  let calendarsScanned   = 0;
  let eventsScanned      = 0;
  let candidatesToCreate = 0;
  let createdEntries     = 0;

  Logger.log(
    `syncCalendarToClockify: scanning from ${since.toISOString()} to ${until.toISOString()}`
  );

  syncCalendarIds.forEach(calId => {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) {
      Logger.log(`  - Calendar not found: ${calId}`);
      return;
    }

    calendarsScanned++;

    const events = cal.getEvents(since, until);
    eventsScanned += events.length;

    Logger.log(
      `  - Calendar "${cal.getName()}" (${calId}) has ${events.length} events in window`
    );

    events.forEach(ev => {
      // Skip all-day events (no specific hours)
      if (ev.isAllDayEvent && ev.isAllDayEvent()) {
        Logger.log(`    * Skipping all-day event "${ev.getTitle()}"`);
        return;
      }

      const desc = ev.getDescription() || '';
      if (desc.indexOf(CLOCKIFY_MARKER) !== -1) {
        // Already linked to Clockify
        return;
      }

      candidatesToCreate++;

      const projectName = getProjectNameForCalendarId(calId);
      if (!projectName) {
        Logger.log(
          `    * Skipping event "${ev.getTitle()}" (no projectName for calendar)`
        );
        return;
      }

      Logger.log(
        `    * Creating Clockify entry for "${ev.getTitle()}" [project: ${projectName}]`
      );

      const clockifyId = createClockifyEntryFromEvent(ev, projectName);
      if (clockifyId) {
        createdEntries++;

        const userDesc = extractUserDescriptionFromEvent(desc);
        const metaBlock =
          (userDesc ? '\n\n' : '') +
          '---\n' +
          CLOCKIFY_MARKER + clockifyId +
          '\nProject: ' + projectName;

        ev.setDescription((userDesc || '') + metaBlock);
      }
    });
  });

  Logger.log(
    `syncCalendarToClockify summary: ` +
    `${calendarsScanned} calendars scanned, ` +
    `${eventsScanned} events seen, ` +
    `${candidatesToCreate} candidates, ` +
    `${createdEntries} Clockify entries created.`
  );
}

/**
 * Create a Clockify time entry from a calendar event.
 * Returns new Clockify ID or null.
 */
function createClockifyEntryFromEvent(ev, projectName) {
  const projectId = getProjectIdByName(projectName);
  if (!projectId) {
    Logger.log('No project ID for name: ' + projectName);
    return null;
  }

  const startIso = ev.getStartTime().toISOString();
  const endIso   = ev.getEndTime().toISOString();

  // Use "user" part of event description as Clockify description.
  let desc = extractUserDescriptionFromEvent(ev.getDescription() || '');
  if (!desc) {
    // If user wrote nothing, fall back to title.
    desc = ev.getTitle() || '';
  }

  const body = {
    start:       startIso,
    end:         endIso,
    description: desc,
    projectId:   projectId,
    billable:    false,
    type:        'REGULAR',
    tagIds:      [],
  };

  const url = `https://api.clockify.me/api/v1/workspaces/${CLOCKIFY_WORKSPACE_ID}/time-entries`;

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'X-Api-Key': CLOCKIFY_API_KEY,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });

    const data = JSON.parse(resp.getContentText());
    if (data && data.id) {
      return data.id;
    } else {
      Logger.log('Clockify create response without id: ' + resp.getContentText());
    }
  } catch (e) {
    Logger.log('Error creating Clockify entry: ' + e);
  }

  return null;
}