# GAUNTLET — 3-Minute Live Demo & Pitch Script

## Overview
- **Duration**: 3 Minutes
- **Target Audience**: Hackathon Judges, Enterprise Buyers, AI Engineers
- **Key Message**: Static benchmarks don't protect agents in production. Gauntlet stress-tests autonomous agents with real-world chaos and automatically patches them before deployment.

---

## Script & Sequence

### 0:00 - 0:30 | The Hook & Problem
- **Speaker Action**: Show title screen or Gauntlet Dashboard with status "HARNESS ONLINE & ARMED".
- **Spoken Audio**:
  > "Everyone is building autonomous AI agents for financial ops, healthcare, and customer service. But when an agent leaves a clean sandbox and enters the real world, it breaks. Third-party APIs drop packets, return HTTP 500s, rate limit requests, or inject adversarial instructions into tool outputs.
  > Today, teams have zero ways to stress-test agent reliability under chaos. Meet **GAUNTLET**: the first adversarial chaos engineering and automated hardening platform for autonomous AI agents."

---

### 0:30 - 1:15 | The Architecture & Chaos Injection
- **Speaker Action**: Navigate to the left panel on the dashboard.
- **Spoken Audio**:
  > "Gauntlet works in three coordinated stages. 
  > First, our **Saboteur** synthesizes realistic chaos attacks: latency spikes, schema drift, upstream banking crashes, and stealth prompt injections.
  > Second, our transparent **Fault Proxy** intercepts the agent's actual tool calls in flight, mutating network traffic and injecting faults without modifying upstream APIs.
  > Let's set chaos intensity to 0.7 and force both a **Stripe Rate Limit Burst** and an **Indirect Prompt Injection**."
- **Action**: Check checkboxes, click **LAUNCH GAUNTLET**.

---

### 1:15 - 2:00 | Live Interception & The Referee
- **Speaker Action**: Highlight real-time execution trace appearing in the center console.
- **Spoken Audio**:
  > "Watch the trace: the Subject agent initiates an enterprise settlement. The proxy intercepts the first query and triggers chaos. The agent recognizes the issue and engages a circuit breaker.
  > Next, our **Referee Judge** audits the full trace independently. It verifies that safety boundaries were not breached and checks whether the agent hallucinated a false success.
  > Notice the verdict: **RESILIENT_DEGRADED** with a **92% Resilience Score**. The agent mitigated the 429 and safely quarantined the hostile prompt injection."

---

### 2:00 - 2:45 | Automated Hardening & Remediation
- **Speaker Action**: Scroll down to the **Automated Hardening Recommendations** section and show the git diff box.
- **Spoken Audio**:
  > "Here is where Gauntlet goes beyond testing to automated healing: our **Hardener Engine** diagnosed exactly why degradation occurred and generated ready-to-merge git diff patches.
  > It produced an untrusted XML delimiter wrapper for prompt sandboxing, and configured a jittered exponential backoff policy for rate limits. One click, and your agent is hardened for production."

---

### 2:45 - 3:00 | Conclusion & Call to Action
- **Spoken Audio**:
  > "Don't send fragile agents into production. Put them through the Gauntlet. Thank you!"
