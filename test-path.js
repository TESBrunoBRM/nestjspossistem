const { pathToRegexp } = require('path-to-regexp');
try { pathToRegexp('/api/{*splat}'); console.log('1 ok'); } catch(e) { console.log('1 err', e.message); }
try { pathToRegexp('/api/:splat*'); console.log('2 ok'); } catch(e) { console.log('2 err', e.message); }
try { pathToRegexp('/api/*'); console.log('3 ok'); } catch(e) { console.log('3 err', e.message); }
