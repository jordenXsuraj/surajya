# Surajya / MeetNet

A full-stack social networking and collaboration platform featuring a React (Vite) frontend and a Node.js (Express + MongoDB) backend.

## Project Structure

```
.
├── docker-compose.yml       # Multi-container Docker orchestration
├── .dockerignore
├── nexusnetwork/            # Frontend (React + Vite)
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   ├── .env.example
│   └── src/
└── server/                  # Backend API (Node.js + Express + Mongoose)
    ├── Dockerfile
    ├── .dockerignore
    ├── .env.example
    ├── index.js
    ├── models/
    └── routes/
```

---

## Running with Docker (Recommended)

To spin up the entire application stack including the MongoDB database:

```bash
docker compose up --build
```

- **Frontend**: Accessible at [http://localhost](http://localhost) (Port 80)
- **Backend API**: Accessible at [http://localhost:5000](http://localhost:5000)
- **MongoDB**: Running at `localhost:27017`

To stop the containers:
```bash
docker compose down
```

---

## Running Locally Without Docker

### Prerequisites
- Node.js 20+
- MongoDB instance running locally or via MongoDB Atlas

### 1. Backend Setup
```bash
cd server
cp .env.example .env     # Configure MONGO_URI, JWT_SECRET, etc.
npm install
npm run dev              # Starts API on http://localhost:5000
```

### 2. Frontend Setup
```bash
cd nexusnetwork
cp .env.example .env     # Configure VITE_API_URL
npm install
npm run dev              # Starts frontend on http://localhost:5173
```
