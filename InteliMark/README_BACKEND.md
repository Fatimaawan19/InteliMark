Backend setup & run instructions

1) Set MongoDB connection string (do NOT commit credentials)

- Create a `.env` file in the project root (or set env var in your shell):

  MONGO_URI="your-mongodb-connection-string"

  Example (PowerShell):
  $env:MONGO_URI = "mongodb+srv://USER:PASS@cluster.mongodb.net/DBNAME"

  Example (bash/mac):
  export MONGO_URI="mongodb+srv://USER:PASS@cluster.mongodb.net/DBNAME"

2) Start the backend

From project root run:

```bash
node backend/server.js
```

Or use the provided npm script:

```bash
npm run start
# or
npm run start-backend
```

3) Troubleshooting

- If the process exits immediately with a message about `MONGO_URI` missing, ensure the environment variable is set before starting the server.
- If you see MongoDB connection errors, confirm credentials and network access (IP whitelist, SRV format).
- Uploads are stored in `backend/uploads` and served from `/api/courses/syllabus/:filename`.

4) Notes

- The server intentionally only starts after a successful MongoDB connection to avoid Mongoose buffering and timeouts.
- If the DB is temporarily unavailable, upload endpoints will return a fallback response containing `syllabusURL` and `extractedText` so the frontend can continue.
