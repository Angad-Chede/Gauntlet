# ⚔️ GAUNTLET
> **Adversarial Chaos Engineering & Automated Hardening Platform for Autonomous AI Agents**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110.0-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg?logo=python)](https://python.org)
[![Resilience](https://img.shields.io/badge/Agent_Resilience-Enterprise_Ready-8B5CF6.svg)]()

---

## 🎯 What is GAUNTLET?
Autonomous agents in production operate in hostile, unpredictable environments. When external APIs fail, experience latency spikes, suffer breaking schema drifts, or return adversarial payloads, agents frequently **crash, hallucinate false success, or succumb to indirect prompt injections**.

**GAUNTLET** is the end-to-end resilience harness that subjects autonomous agents to rigorous chaos conditions and synthesizes automated code and prompt hardening patches before deployment.

```
                           ┌─────────────────────────┐
                           │      SABOTEUR           │
                           │  (Adversarial Chaos)    │
                           └────────────┬────────────┘
                                        │ (Injects Chaos)
                                        ▼
┌───────────────┐  Tools / APIs ┌─────────────────────────┐  Mutated Data ┌────────────────┐
│ SUBJECT AGENT │ ────────────> │       FAULT PROXY       │ ────────────> │  ENVIRONMENT / │
│ (Target Agent)│ <──────────── │ (Latency, 500, Injection│ <──────────── │  MOCK SERVICES │
└───────┬───────┘               └─────────────────────────┘               └────────────────┘
        │
        │ Execution Trace
        ▼
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│     REFEREE JUDGE       │ ──> │      SCORER ENGINE      │ ──> │     HARDENER ENGINE     │
│ (Safety & Hallucination)│     │(Resilience / Degradation│     │  (Git Diff Auto-Patch)  │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

---

## 🏗️ Architecture & Project Structure

```text
Gauntlet
├── app/
│   ├── main.py              # FastAPI server & web endpoints
│   ├── orchestrator.py      # Test harness lifecycle coordinator
│   ├── subject.py           # Simulated autonomous agent under test
│   ├── saboteur.py          # Adversarial chaos generator & attack catalog
│   ├── fault_proxy.py       # Transparent interceptor & mutation proxy
│   ├── referee.py           # Independent auditor & safety boundary judge
│   ├── scorer.py            # Quantitative resilience & degradation scorer
│   ├── hardener.py          # Auto-remediation & git-diff patch synthesizer
│   ├── models.py            # Pydantic schemas & state models
│   └── templates/
│       └── index.html       # Sleek dark-mode observability dashboard
├── tests/
│   ├── test_subject.py      # Unit tests for agent recovery workflows
│   ├── test_faults.py       # Unit tests for fault proxy mutations
│   ├── test_referee.py      # Unit tests for referee verdict evaluations
│   └── test_safety.py       # Unit tests for prompt injection quarantine
├── runs/                    # Timestamped test executions and JSON telemetry
├── evidence/                # Tamper-evident cryptographic proof packets
├── docs/
│   ├── business-plan.md     # Market opportunity, TAM, and pricing model
│   └── demo-script.md       # 3-minute pitch and presentation script
├── .env.example             # Environment configuration template
├── .gitignore               # Clean exclusions for secrets & artifacts
├── README.md                # Documentation & quickstart guide
├── hackathon.md             # Hackathon project submission summary
└── requirements.txt         # Core dependencies
```

---

## 🚀 Quickstart

### 1. Prerequisites & Environment Setup
Clone the repository and activate your virtual environment:

```bash
# Clone repository
git clone https://github.com/Angad-Chede/Gauntlet.git
cd Gauntlet

# Setup Python virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment
Copy the `.env.example` file:
```bash
cp .env.example .env
```

### 3. Launch the GAUNTLET Dashboard
Start the local FastAPI server:
```bash
python -m app.main
```
Or with Uvicorn directly:
```bash
uvicorn app.main:app --reload --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser to interact with the Gauntlet Console.

### 4. Run the Test Suite
Run the test suite using `pytest`:
```bash
pytest -v
```

---

## ⚡ API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Web observability dashboard |
| `GET` | `/api/health` | Service health status |
| `GET` | `/api/faults` | List all adversarial attack vectors |
| `POST` | `/api/run` | Execute a chaos gauntlet against the agent |
| `GET` | `/api/runs` | Retrieve historical gauntlet runs |
| `GET` | `/api/runs/{run_id}` | Detailed trace, score, and hardening diffs |
| `GET` | `/api/runs/{run_id}/evidence` | Tamper-evident cryptographically sealed proof packet |
| `GET` | `/api/runs/{run_id}/evidence/verify` | Verify cryptographic SHA-256 seal of an evidence packet |

---

## 🛡️ License
Distributed under the Apache 2.0 License. See `LICENSE` for more information.
