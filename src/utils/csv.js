/**
 * Converts an array of user documents into a CSV string.
 * @param {Array} users - Array of User documents with referredBy populated.
 * @returns {string} - CSV formatted string.
 */
const exportUsersToCSV = (users) => {
  const headers = [
    'Telegram ID',
    'Username',
    'First Name',
    'Referred By (ID)',
    'Referred By (Username)',
    'Total Referrals',
    'Verified Status',
    'Verified At (IST)',
    'IP Address',
    'Fingerprint Hash',
    'RAM Size',
    'Screen Resolution',
    'Platform/OS',
    'Timezone',
    'Suspicious Status',
    'Flagged Reason',
    'Joined Date'
  ];

  const escapeCSV = (str) => {
    if (str === null || str === undefined) return '';
    const val = String(str);
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const rows = users.map(user => [
    user.telegramId,
    user.username || '',
    user.firstName,
    user.referredBy ? user.referredBy.telegramId : '',
    user.referredBy ? (user.referredBy.username || '') : '',
    user.referrals,
    user.verified ? 'Verified' : 'Unverified',
    user.verifiedAtIST || (user.verifiedAt ? user.verifiedAt.toISOString() : ''),
    user.ipAddress || '',
    user.deviceFingerprint || '',
    user.deviceSpecs ? (user.deviceSpecs.ram || '') : '',
    user.deviceSpecs ? (user.deviceSpecs.screen || '') : '',
    user.deviceSpecs ? (user.deviceSpecs.platform || '') : '',
    user.deviceSpecs ? (user.deviceSpecs.timezone || '') : '',
    user.suspicious ? 'SUSPICIOUS' : 'OK',
    user.flaggedReason || '',
    user.createdAt ? user.createdAt.toISOString() : ''
  ]);

  const csvContent = [
    headers.map(h => escapeCSV(h)).join(','),
    ...rows.map(row => row.map(val => escapeCSV(val)).join(','))
  ].join('\n');

  return csvContent;
};

module.exports = {
  exportUsersToCSV,
};
