const sql = require('mssql');

const config = {
  user: 'sa',
  password: '1234',
  server: 'LAPTOP-OF-LUAN\\MAYCHU',
  database: 'QLKS', 
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let poolPromise;
function getPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(config);
    poolPromise = pool.connect().then(p => {
      console.log('Connected to SQL Server');
      return p;
    }).catch(err => {
      poolPromise = null;
      console.error('SQL connection error:', err);
      throw err;
    });
  }
  return poolPromise;
}

module.exports = { sql, getPool };