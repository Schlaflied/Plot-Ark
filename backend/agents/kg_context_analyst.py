"""KG Context Analyst — bridges Knowledge Graph with the Curriculum Agent.

Phase 5B P0 node in the Agentic Loop:
  BA → RA → CO → CC → [KG_Context_Analyst] → CurriculumAgent

This node:
  1. Calls get_kg_mapping_for_course() to get module ↔ KG concept mapping.
  2. Cross-references with threshold flags (from SharedMemory) to find
     flagged modules that have KG concept matches.
  3. Writes a SLIM kg_context object to SharedMemory for the CurriculumAgent
     to read — only flagged modules with KG data, to save tokens.

Design decisions (from implementation plan):
  - Q36: kg_context is "Slim" — only flagged modules, not full course KG.
  - Q37: This is a new file inheriting from BaseNode.
  - No LLM calls (sql-only phase).
"""

from agents.base import BaseNode, SharedMemory
from services.kg_mapper import get_kg_mapping_for_course


class KGContextAnalystNode(BaseNode):
    name = "kg_context_analyst"
    description = "Analyzes KG concept mapping for flagged modules"
    model = "sql-only"
    required_output_keys = ["kg_context"]

    def _run(self, sm: SharedMemory) -> dict:
        course_id = sm.get("course_id")
        flagged_modules = sm.get("flagged_modules", [])

        # ── 1. Get full KG mapping for this course ────────────────────────
        full_mapping = get_kg_mapping_for_course(course_id)

        if not full_mapping:
            # No KG available for this course — return empty context
            return {
                "kg_context": {
                    "available": False,
                    "reason": "no_kg_for_course",
                    "flagged_with_concepts": [],
                },
            }

        # ── 2. Extract flagged module IDs ─────────────────────────────────
        flagged_ids = set()
        for flag in flagged_modules:
            if isinstance(flag, dict):
                mod_id = flag.get("module_id", "")
            else:
                mod_id = str(flag)
            if mod_id:
                flagged_ids.add(mod_id)

        # ── 3. Build slim context: only flagged modules with KG matches ───
        module_concepts = full_mapping.get("module_concepts", {})
        dependencies = full_mapping.get("dependencies", [])

        flagged_with_concepts = []
        for mod_id in flagged_ids:
            # module_concepts keys are like "1", "2", etc. (stringified module numbers)
            # flag module_ids are like "module_1", "module_2"
            mod_num = mod_id.replace("module_", "")
            concepts = module_concepts.get(mod_num, [])

            if not concepts:
                continue

            # Find related dependencies (from or to this module)
            try:
                mod_num_int = int(mod_num)
            except ValueError:
                mod_num_int = -1

            related_deps = [
                d for d in dependencies
                if d.get("from_module") == mod_num_int or d.get("to_module") == mod_num_int
            ]

            # Find the flag data for context
            flag_data = next(
                (f for f in flagged_modules
                 if (f.get("module_id") if isinstance(f, dict) else str(f)) == mod_id),
                {}
            )

            flagged_with_concepts.append({
                "module_id": mod_id,
                "module_name": flag_data.get("module_name", mod_id) if isinstance(flag_data, dict) else mod_id,
                "flag_level": flag_data.get("flag_level", "yellow") if isinstance(flag_data, dict) else "yellow",
                "concepts": [
                    {
                        "label": c["label"],
                        "definition": c.get("definition", "")[:200],  # truncate to save tokens
                    }
                    for c in concepts[:5]  # cap at 5 concepts per module
                ],
                "prerequisite_gaps": [
                    {
                        "from_module": d["from_module"],
                        "to_module": d["to_module"],
                        "from_concept": d["from_concept"],
                        "to_concept": d["to_concept"],
                    }
                    for d in related_deps[:3]  # cap at 3 deps per module
                ],
            })

        kg_context = {
            "available": True,
            "course_topic": full_mapping.get("topic", ""),
            "total_kg_concepts": full_mapping.get("total_concepts_matched", 0),
            "total_dependencies": len(dependencies),
            "flagged_with_concepts": flagged_with_concepts,
        }

        return {"kg_context": kg_context}

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        """Fallback: return empty KG context (non-fatal)."""
        return {
            "kg_context": {
                "available": False,
                "reason": "fallback",
                "flagged_with_concepts": [],
            },
        }
