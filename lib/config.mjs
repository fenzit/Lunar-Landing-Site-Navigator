import { loadEnvFile } from 'node:process';

try {loadEnvFile();} catch(error) {if(error.code!=='ENOENT') throw error;}
const timeout=Number(process.env.LUNARPILOT_TERRAIN_TIMEOUT_MS??30000);
if(!Number.isFinite(timeout)||timeout<1000||timeout>120000) throw new Error('LUNARPILOT_TERRAIN_TIMEOUT_MS must be 1000–120000');
export const terrainTimeoutMs=timeout;
