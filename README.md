# Surajya / MeetNet

A full-stack social networking and collaboration platform featuring a React (Vite) frontend and a Node.js (Express + MongoDB) backend.

## Project Structure

```
.
├── docker-compose.yml       # Multi-container Docker orchestration (Unique Ports)
├── .dockerignore
├── .env.example             # Root port & environment configurations
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

All containers are mapped to **unique dedicated ports** to avoid conflicts with any other projects on your machine:

| Service | Host Port | Internal Container Port | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | **`38180`** | `80` | [http://localhost:38180](http://localhost:38180) |
| **Backend API** | **`38150`** | `5000` | [http://localhost:38150](http://localhost:38150) |
| **MongoDB** | **`38127`** | `27017` | `mongodb://localhost:38127` |

### Start All Services
```bash
docker compose up --build
```

- **Web App**: Open [http://localhost:38180](http://localhost:38180) in your browser.
- **Backend API**: Accessible at [http://localhost:38150](http://localhost:38150) (Health check: [http://localhost:38150/healthz](http://localhost:38150/healthz)).
- **MongoDB**: Listening on host port `38127` with persistent named volume `mongo_data`.

### Stop Services
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
