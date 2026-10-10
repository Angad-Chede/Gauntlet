# GAUNTLET — Hackathon Project Submission

## ⚔️ Project Overview
- **Project Name**: GAUNTLET
- **Tagline**: Adversarial Chaos Engineering & Automated Hardening for Autonomous AI Agents
- **Category**: AI Safety, Agent Tooling & Developer Infrastructure
- **GitHub Repository**: [https://github.com/Angad-Chede/Gauntlet.git](https://github.com/Angad-Chede/Gauntlet.git)

---

## 💡 Inspiration
The industry has fallen in love with autonomous AI agents that make multi-step tool calls to book flights, execute financial trades, or update CRM records. But when agents leave benign test environments, they encounter real-world chaos:
- Third-party APIs throw 500 crashes and 429 rate limit errors.
- Network latency spikes cause agents to time out mid-execution.
- Flaky services return corrupted JSON or drifted schemas.
- Untrusted tool outputs contain indirect prompt injection attacks.

Existing evaluation tools only check static benchmark questions. No tool was stress-testing agentic robustness in live, chaotic execution environments. We built **GAUNTLET** to solve this: **Chaos Monkey meets Red-Teaming for AI Agents**.

---

## 🚀 What It Does
1. **Adversarial Chaos Injection (Saboteur & Fault Proxy)**:
   Interception layer that hooks into agent tool calls, simulating network degradation, latency spikes, rate limit exhaustion, broken schemas, and indirect prompt injections.
2. **Autonomous Agent Execution (Subject)**:
   Executes realistic multi-step mission workflows equipped with retry mechanisms, circuit breakers, and fallback strategies.
3. **Independent Referee Judge**:
   An auditing agent that verifies whether safety boundaries were breached, checks if the agent hallucinated successful actions despite tool crashes, and confirms graceful degradation.
4. **Resilience Scoring**:
   Standardized, weighted index scoring Fault Tolerance (40%), Safety Preservation (35%), and Recovery Speed (25%).
5. **Automated Hardening**:
   Generates ready-to-merge git diff patches (XML delimiter wrappers, exponential jittered backoffs, circuit breakers, and strict schema validators).
6. **Observability Dashboard**:
   A cyber-observability interface to configure attacks, monitor real-time execution traces, and inspect hardening diffs.

---

## 🛠️ Tech Stack & Implementation
- **Backend**: Python 3.10+, FastAPI, Asyncio, Pydantic v2
- **Agent Harness**: Custom Async Interception Proxy (`FaultProxy`), Referee Judge, Chaos Synthesizer (`Saboteur`)
- **Frontend / UI**: Vanilla CSS Design System with dark-mode glassmorphic aesthetics, Jinja2 templating, and asynchronous real-time event streaming
- **Persistence & Evidence**: JSON Run Traces, Cryptographic Tamper-Evident Proof Packets (`evidence/`)
- **Testing**: PyTest with full async coverage for faults, safety quarantines, and referee evaluations

---

## 🏆 Alignment with Judging Criteria

### 1. Innovation & Originality
Gauntlet is the first platform to bridge Chaos Engineering with AI Agent Safety. Instead of simply asserting prompt accuracy, it tests how agents survive dynamic environment failure.

### 2. Technical Execution
A clean asynchronous architecture where tools are intercepted cleanly via the `FaultProxy` without touching third-party APIs. Every run produces an auditable trace, a referee verdict, and an actionable auto-patch diff.

### 3. Real-World Impact
Provides enterprises deploying high-stakes autonomous agents (Fintech, Health, DevOps) with the reliability assurance needed to graduate agents from pilots to production.

### 4. Polish & Usability
A responsive UI with live metric updates, adjustable chaos sliders, structured timelines, and syntax-highlighted git diffs.
