// utils/attendanceTime.js

const TIMEZONE = 'Asia/Jakarta'

const getCurrentDateTime = () => {
  const parts = new Intl.DateTimeFormat(
    'en-GB',
    {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }
  ).formatToParts(new Date())

  const get = (type) =>
    parts.find((p) => p.type === type)?.value

  return {
    tanggal:
      `${get('year')}-${get('month')}-${get('day')}`,
    jam:
      `${get('hour')}:${get('minute')}:${get('second')}`,
  }
}

const timeToSeconds = (time) => {
  const [h, m, s = 0] = String(time)
    .split(':')
    .map(Number)

  return h * 3600 + m * 60 + s
}

const getAttendanceStatus = (
  jam,
  jamMasuk,
  batasTerlambat
) => {
  const batas =
    timeToSeconds(jamMasuk) +
    Number(batasTerlambat) * 60

  return timeToSeconds(jam) <= batas
    ? 'hadir'
    : 'terlambat'
}

module.exports = {
  getCurrentDateTime,
  getAttendanceStatus,
}