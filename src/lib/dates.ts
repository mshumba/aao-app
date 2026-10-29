/**
 * The names the app writes dates with ("Tuesday 21 May", "27 Sep 2026").
 * Plain data with no imports, so the Node tests can load what uses it.
 */

/** Sunday first, as Date's getDay() counts. */
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** January first, as Date's getMonth() counts. */
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Jan" … "Dec". */
export const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));
