// Calls the local API from a flow (Maestro runs on this PC), as another seed user: the push or the
// notification the step expects arrives while the screen is being watched.
//   env: METHOD, API_PATH (/users/<id>/connect …), TOKEN, BODY (JSON text, optional)
const response = http.request(`http://localhost:5000/api${API_PATH}`, {
  method: METHOD,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: typeof BODY === 'undefined' ? '{}' : BODY,
});
if (response.status >= 300) throw new Error(`${METHOD} ${API_PATH} → ${response.status} ${response.body}`);
output.apiStatus = response.status;
