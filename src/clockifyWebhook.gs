/*************************************************
 * clockifyWebhook.gs
 * Main HTTP endpoint for Clockify webhooks (POST).
 *
 * Clockify calls this URL whenever a time entry is
 * created / updated / stopped / deleted.
 *************************************************/

/**
 * Tombstone helpers for deleted Clockify IDs.
 * Stored in Script Properties so stale retried upserts can be ignored.
 */

function getDeletedClockifyKey(clockifyId) {
  return 'deleted_' + clockifyId;
}

function markClockifyIdDeleted(clockifyId) {
  if (!clockifyId) return;
  SCRIPT_PROPS.setProperty(getDeletedClockifyKey(clockifyId), String(Date.now()));
}

function isClockifyIdMarkedDeleted(clockifyId) {
  if (!clockifyId) return false;
  return !!SCRIPT_PROPS.getProperty(getDeletedClockifyKey(clockifyId));
}

function clearDeletedClockifyMarker(clockifyId) {
  if (!clockifyId) return;
  SCRIPT_PROPS.deleteProperty(getDeletedClockifyKey(clockifyId));
}

function cleanupDeletedClockifyMarkers(daysToKeep) {
  const now = Date.now();
  const maxAgeMs = daysToKeep * DAY_MS;
  const props = SCRIPT_PROPS.getProperties();

  Object.keys(props).forEach(key => {
    if (!key.startsWith('deleted_')) return;

    const ts = Number(props[key]);
    if (!ts || (now - ts) > maxAgeMs) {
      SCRIPT_PROPS.deleteProperty(key);
    }
  });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw) {
      Logger.log('doPost: empty body');
      appendSheetLog('WEBHOOK', '(none)', '', '', '', 'NO_BODY', 'Empty POST body');
      return ContentService.createTextOutput('No body');
    }

    Logger.log('doPost: raw payload: ' + raw);
    const payload = JSON.parse(raw);

    // Optional housekeeping
    cleanupDeletedClockifyMarkers(30);

    // evt can come from the URL (?evt=delete) OR from the JSON
    const evtFromQuery = (e && e.parameter && e.parameter.evt)
      ? String(e.parameter.evt).toLowerCase()
      : '';
    const evtFromBody = (payload.evt || '').toLowerCase();
    const evtType = evtFromQuery || evtFromBody || '';

    // Clockify id can appear under different keys
    const clockifyId =
      payload.id ||
      payload.timeEntryId ||
      payload.time_entry_id ||
      '';

    Logger.log(`doPost: evt=${evtType || '(none)'}, id=${clockifyId || '(none)'}`);

    if (!clockifyId) {
      appendSheetLog('WEBHOOK', evtType, '', '', '', 'NO_ID', 'Webhook payload without id');
      return ContentService.createTextOutput('OK');
    }

    const projectName = payload.project && payload.project.name ? payload.project.name : '';
    const calendarId  = projectName ? getCalendarIdForProjectName(projectName) : '';

    const isDelete = (evtType === 'delete');

    if (isDelete) {
      const deletedCount = deleteCalendarEventsByClockifyId(clockifyId);
      markClockifyIdDeleted(clockifyId);

      Logger.log(
        `doPost summary: delete branch, evt=${evtType}, id=${clockifyId}, deleted=${deletedCount}`
      );

      appendSheetLog(
        'WEBHOOK',
        evtType,
        clockifyId,
        projectName,
        calendarId,
        'DELETE',
        `deletedCount=${deletedCount}`
      );

    } else {
      // Ignore stale retried upserts after a delete
      if (isClockifyIdMarkedDeleted(clockifyId)) {
        Logger.log(`doPost: ignoring stale upsert for previously deleted id=${clockifyId}`);

        appendSheetLog(
          'WEBHOOK',
          evtType || 'unknown',
          clockifyId,
          projectName,
          calendarId,
          'IGNORED_STALE_UPSERT',
          'Ignored because this Clockify ID was previously deleted'
        );

        return ContentService.createTextOutput('OK');
      }

      const result = upsertCalendarEventFromClockifyPayload(payload);

      Logger.log(
        `doPost summary: upsert branch, evt=${evtType}, id=${clockifyId}, ` +
        `created=${result.created}, updated=${result.updated}, moved=${result.moved || 0}, ` +
        `duplicatesDeleted=${result.duplicatesDeleted || 0}`
      );

      appendSheetLog(
        'WEBHOOK',
        evtType || 'unknown',
        clockifyId,
        projectName,
        calendarId,
        'UPSERT',
        `created=${result.created}, updated=${result.updated}, moved=${result.moved || 0}, duplicatesDeleted=${result.duplicatesDeleted || 0}`
      );
    }

    return ContentService.createTextOutput('OK');

  } catch (err) {
    Logger.log('Error in doPost: ' + err + (err.stack ? '\n' + err.stack : ''));
    appendSheetLog('WEBHOOK', 'error', '', '', '', 'ERROR', String(err));
    return ContentService.createTextOutput('Error');
  }
}

/**
 * Create or update a calendar event based on Clockify webhook payload.
 */
/**
 * Search all relevant calendars for an event linked to this Clockify ID.
 * Returns:
 *   { calendar: Calendar, calendarId: string, event: CalendarEvent }
 * or null if not found.
 */
function findExistingEventAnywhereByClockifyId(clockifyId, start, end) {
  const allCalendarIds = [...new Set(
    Object.values(PROJECT_TO_CALENDAR).concat([DEFAULT_CALENDAR_ID])
  )];

  for (const calId of allCalendarIds) {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) continue;

    const ev = findExistingEventByClockifyId(cal, clockifyId, start, end);
    if (ev) {
      return {
        calendar: cal,
        calendarId: calId,
        event: ev,
      };
    }
  }

  return null;
}


/**
 * Create or update a calendar event based on Clockify webhook payload.
 * Handles project changes by moving the event to the target calendar.
 */
function upsertCalendarEventFromClockifyPayload(entry) {
  const summary = { created: 0, updated: 0, moved: 0, duplicatesDeleted: 0 };

  // Ignore running timers (no end time)
  if (!entry.timeInterval || !entry.timeInterval.end) {
    Logger.log('upsert: skipping running timer with id ' + entry.id);
    return summary;
  }

  const start = new Date(entry.timeInterval.start);
  const end   = new Date(entry.timeInterval.end);

  const projectName = entry.project && entry.project.name ? entry.project.name : 'No Project';
  const tags        = Array.isArray(entry.tags) ? entry.tags.map(t => t.name) : [];
  const clockifyId  = entry.id;
  const taskName    = entry.task && entry.task.name ? entry.task.name : '';

  const targetCalendarId = getCalendarIdForProjectName(projectName);
  const targetCalendar   = CalendarApp.getCalendarById(targetCalendarId);

  if (!targetCalendar) {
    Logger.log(`upsert: target calendar not found for id ${targetCalendarId}`);
    return summary;
  }

  const title       = buildEventTitleFromClockifyEntry(entry);
  const description = buildEventDescriptionFromClockifyEntry(entry, projectName, tags, clockifyId);

  const allCalendarIds = [...new Set(
    Object.values(PROJECT_TO_CALENDAR).concat([DEFAULT_CALENDAR_ID])
  )];

  let allMatches = [];

  allCalendarIds.forEach(calId => {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) return;

    const matches = findExistingEventsByClockifyId(cal, clockifyId, start, end);
    matches.forEach(ev => {
      allMatches.push({
        calendar: cal,
        calendarId: calId,
        event: ev,
      });
    });
  });

  // Split matches into target calendar and non-target calendars
  const targetMatches = allMatches.filter(m => m.calendarId === targetCalendarId);
  const otherMatches  = allMatches.filter(m => m.calendarId !== targetCalendarId);

  let keeper = null;

  if (targetMatches.length > 0) {
    // Best case: keep the first event already in the correct calendar
    keeper = targetMatches[0];
  } else if (otherMatches.length > 0) {
    // No target event exists, but an old one exists elsewhere -> create a new one in target
    const newEvent = targetCalendar.createEvent(title, start, end, { description: description });
    applyColorToEvent(newEvent, taskName, projectName, tags);

    keeper = {
      calendar: targetCalendar,
      calendarId: targetCalendarId,
      event: newEvent,
    };

    summary.moved = 1;
    Logger.log(`upsert: moved event "${title}" into calendar ${targetCalendar.getName()}`);
  } else {
    // No match anywhere -> create fresh
    const newEvent = targetCalendar.createEvent(title, start, end, { description: description });
    applyColorToEvent(newEvent, taskName, projectName, tags);

    keeper = {
      calendar: targetCalendar,
      calendarId: targetCalendarId,
      event: newEvent,
    };

    summary.created = 1;
    Logger.log(`upsert: created event "${title}" in calendar ${targetCalendar.getName()}`);
  }

  // Update the keeper so it always reflects latest Clockify data
  keeper.event.setTitle(title);
  keeper.event.setDescription(description);
  keeper.event.setTime(start, end);
  applyColorToEvent(keeper.event, taskName, projectName, tags);

  if (!summary.created && !summary.moved) {
    summary.updated = 1;
    Logger.log(`upsert: updated keeper "${title}" in calendar ${keeper.calendar.getName()}`);
  }

  // Delete every duplicate except the keeper
  allMatches.forEach(match => {
    if (match.event.getId() === keeper.event.getId()) return;

    Logger.log(
      `upsert: deleting duplicate "${match.event.getTitle()}" from calendar ${match.calendar.getName()}`
    );
    match.event.deleteEvent();
    summary.duplicatesDeleted++;
  });

  return summary;
}

/**
 * Delete events (in all relevant calendars) that match a given Clockify ID.
 */
function deleteCalendarEventsByClockifyId(clockifyId) {
  const from = new Date(Date.now() - DELETE_EVENT_DAYS_BEFORE * DAY_MS);
  const to   = new Date(Date.now() + DELETE_EVENT_DAYS_AFTER  * DAY_MS);

  const allCalendarIds = Object.values(PROJECT_TO_CALENDAR).concat([DEFAULT_CALENDAR_ID]);
  let deletedCount = 0;

  allCalendarIds.forEach(calId => {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) return;

    const events = cal.getEvents(from, to);
    events.forEach(ev => {
      const desc = ev.getDescription() || '';
      if (desc.indexOf(CLOCKIFY_MARKER + clockifyId) !== -1) {
        Logger.log(`delete: deleting event "${ev.getTitle()}" from calendar ${cal.getName()}`);
        ev.deleteEvent();
        deletedCount++;
      }
    });
  });

  return deletedCount;
}