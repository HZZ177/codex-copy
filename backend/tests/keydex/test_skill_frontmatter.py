import pytest

from backend.app.keydex.skills import (
    SkillDefinitionError,
    parse_skill_frontmatter_text,
    validate_skill_description,
    validate_skill_name,
)


def test_parse_skill_frontmatter_accepts_name_and_description() -> None:
    metadata = parse_skill_frontmatter_text(
        """---
name: dev-plan
description: Generate a development plan.
---

# Dev Plan
""",
    )

    assert metadata == {
        "name": "dev-plan",
        "description": "Generate a development plan.",
    }


def test_parse_skill_frontmatter_accepts_quoted_values() -> None:
    metadata = parse_skill_frontmatter_text(
        """---
name: "crud_generator"
description: 'Generate CRUD pages'
---
""",
    )

    assert metadata["name"] == "crud_generator"
    assert metadata["description"] == "Generate CRUD pages"


def test_parse_skill_frontmatter_accepts_literal_block_description() -> None:
    metadata = parse_skill_frontmatter_text(
        """---
name: design-doc
description: |
  Write a DES document.

  Keep it traceable.
---
""",
    )

    assert metadata["name"] == "design-doc"
    assert metadata["description"] == "Write a DES document.\n\nKeep it traceable."


def test_parse_skill_frontmatter_requires_opening_delimiter() -> None:
    with pytest.raises(SkillDefinitionError) as exc_info:
        parse_skill_frontmatter_text("name: dev-plan\n")

    assert exc_info.value.code == "skill_frontmatter_missing"
    assert exc_info.value.to_diagnostic().severity == "error"


def test_parse_skill_frontmatter_requires_name() -> None:
    with pytest.raises(SkillDefinitionError) as exc_info:
        parse_skill_frontmatter_text(
            """---
description: Generate a development plan.
---
""",
        )

    assert exc_info.value.code == "skill_frontmatter_missing_name"


def test_validate_skill_name_rejects_invalid_characters() -> None:
    with pytest.raises(SkillDefinitionError) as exc_info:
        validate_skill_name("../bad")

    assert exc_info.value.code == "skill_name_invalid"


def test_validate_skill_name_rejects_over_64_characters() -> None:
    with pytest.raises(SkillDefinitionError) as exc_info:
        validate_skill_name("a" * 65)

    assert exc_info.value.code == "skill_name_invalid"


def test_validate_skill_description_rejects_empty_text() -> None:
    with pytest.raises(SkillDefinitionError) as exc_info:
        validate_skill_description("   ")

    assert exc_info.value.code == "skill_description_empty"
