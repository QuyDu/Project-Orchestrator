# Clarification Result

The requested outcome is an implementation-ready plan for safely updating both the Project Orchestrator source checkout and previously generated projects. This planning action does not implement the updater.

The user delegated the three material decisions autonomously. The accepted defaults are to cover both update surfaces, preserve backward compatibility by making an unqualified `pso update` a safe all-mode, and provide a complete staged design rather than an MVP-only or architecture-only outline.

The generated-project design must preserve locally enhanced skills and project-owned files. It must distinguish base, local, and upstream content; install new capabilities with dependency closure; support additive, all, and select modes; and reserve replacement of conflicting local work for an explicit force action. Existing projects without reconstructable base provenance treat differing managed assets as unknown or customized and require an explicit operator choice.

Git remains authoritative for updating the Launch Pad checkout. A Project Orchestrator helper may guide fetch, comparison, validation, and handoff, but it must not replace Git merge semantics or perform unapproved remote mutation.

Publishing this plan replaces the mutable current workflow-plan and execution-state views. The unrelated P4 plan remains recoverable from accepted event history through sequence 32 and must not be represented as completed or cancelled.

No implementation, skill-contract change, commit, push, publication, deployment, cloud authentication, external mutation, or billable request is authorized.

Decision: proceed to a complete, non-executing update-system workflow plan.