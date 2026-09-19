# Skill Details

Generated: 2026-09-18T23:57:39.243Z

| Skill | Lifecycle | Confidence | Audit | Dependencies |
| --- | --- | --- | --- | --- |
| agent-builder | draft | low | passed | clarify-the-ask, policy-engine, azure-discovery |
| architecture-review | draft | low | passed | clarify-the-ask |
| artifact-upgrade | draft | low | passed | skill-inventory, skill-dependency-manager |
| audit-azure-environment | draft | low | passed | None |
| audit-code | tested | medium | passed | None |
| audit-plan-remediation | tested | medium | passed | audit-review-findings, policy-engine |
| audit-remediation | draft | low | passed | audit-plan-remediation, policy-engine, workflow-state-manager, workflow-recovery, change-review, systematic-debugging, regression-test-development, project-handoff, audit-code |
| audit-review-findings | tested | medium | passed | audit-code, audit-azure-environment |
| azure-cleanup | draft | low | passed | azure-discovery, project-handoff, policy-engine |
| azure-discovery | tested | medium | passed | project-handoff |
| change-review | draft | low | passed | policy-engine |
| ci-failure-triage | draft | low | passed | policy-engine, systematic-debugging, regression-test-development, workflow-state-manager |
| clarify-the-ask | tested | medium | passed | None |
| dependency-maintenance | draft | low | passed | policy-engine, regression-test-development, workflow-state-manager |
| deployment-review | draft | low | passed | architecture-review, security-review |
| development-environment-readiness | tested | medium | passed | policy-engine, workflow-state-manager |
| documentation-builder | tested | medium | passed | clarify-the-ask |
| environment-update | draft | low | passed | development-environment-readiness, policy-engine |
| framework-health-check | draft | low | passed | skill-inventory, skill-dependency-manager |
| linkedin-post | draft | low | passed | project-handoff, documentation-builder, user-personalization |
| live-chat-interaction | draft | low | passed | clarify-the-ask, policy-engine, project-understanding, regression-test-development |
| multi-agent-coordinator | draft | low | passed | workflow-state-manager, workflow-scheduler |
| policy-engine | draft | low | passed | None |
| prepare-commit | draft | low | passed | change-review |
| project-handoff | draft | low | passed | workflow-state-manager |
| project-knowledge-capture | draft | low | passed | project-handoff |
| project-memory | draft | low | passed | project-knowledge-capture |
| project-setup | draft | low | passed | clarify-the-ask, workflow-planner |
| project-skills-orchestrator | tested | medium | passed | clarify-the-ask, workflow-planner, skill-inventory, policy-engine, workflow-state-manager, skill-update |
| project-status | tested | medium | passed | project-handoff, workflow-telemetry, audit-azure-environment |
| project-understanding | draft | low | passed | clarify-the-ask |
| project-video | draft | low | passed | clarify-the-ask, project-understanding, documentation-builder, azure-discovery |
| project-visual-storytelling | draft | low | passed | user-personalization, project-understanding, agent-builder, azure-discovery |
| regression-test-development | draft | low | passed | policy-engine, workflow-state-manager |
| security-review | draft | low | passed | audit-code |
| skill-create | draft | low | passed | skill-inventory, skill-dependency-manager, project-understanding, documentation-builder |
| skill-dependency-manager | draft | low | passed | skill-inventory |
| skill-inventory | tested | medium | passed | None |
| skill-registry | draft | low | passed | skill-inventory, skill-dependency-manager, policy-engine |
| skill-update | draft | low | passed | skill-inventory, skill-dependency-manager, project-understanding, documentation-builder |
| systematic-debugging | draft | low | passed | policy-engine, workflow-state-manager |
| user-personalization | draft | low | passed | None |
| workflow-planner | draft | low | passed | clarify-the-ask, skill-inventory, skill-dependency-manager |
| workflow-recovery | draft | low | passed | workflow-state-manager, project-handoff |
| workflow-scheduler | draft | low | passed | workflow-state-manager, policy-engine |
| workflow-simulator | draft | low | passed | workflow-planner, policy-engine |
| workflow-state-manager | draft | low | passed | workflow-planner |
| workflow-telemetry | draft | low | passed | workflow-state-manager |
