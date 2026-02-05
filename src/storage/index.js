// Storage selector: use Postgres if DATABASE_URL set, otherwise CSV file
if (process.env.DATABASE_URL) {
  module.exports = require('./postgresStore');
} else {
  module.exports = require('./csvStore');
}
