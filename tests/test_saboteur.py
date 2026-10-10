from unittest.mock import patch
import pytest

from app.saboteur import Saboteur


def test_zero_intensity_generates_no_faults():
    saboteur = Saboteur()
    assert saboteur.generate_suite(intensity=0.0) == []
    assert saboteur.generate_suite(intensity=0.0, target_ids=None) == []
    assert saboteur.generate_suite(intensity=-0.5, target_ids=None) == []


def test_explicit_empty_fault_list_generates_no_faults():
    saboteur = Saboteur()
    assert saboteur.generate_suite(intensity=0.8, target_ids=[]) == []
    assert saboteur.generate_suite(intensity=0.0, target_ids=[]) == []


def test_explicit_fault_selection_returns_only_selected_faults():
    saboteur = Saboteur()
    catalog_keys = list(saboteur.catalog.keys())
    assert len(catalog_keys) >= 2
    id1, id2 = catalog_keys[0], catalog_keys[1]

    # Explicit selection should still be selectable even when intensity is zero
    faults = saboteur.generate_suite(
        intensity=0.0,
        target_ids=[id1],
    )
    assert [fault.id for fault in faults] == [id1]

    # Multiple explicit selections preserve requested order
    ordered_faults = saboteur.generate_suite(
        intensity=0.5,
        target_ids=[id2, id1],
    )
    assert [fault.id for fault in ordered_faults] == [id2, id1]


def test_unknown_explicit_fault_id_does_not_select_random_faults():
    saboteur = Saboteur()

    # Unknown ID returns empty list with no random fallback
    faults = saboteur.generate_suite(
        intensity=0.8,
        target_ids=["FAULT-DOES-NOT-EXIST"],
    )
    assert faults == []

    # Mixed known and unknown returns only recognized IDs
    known_id = next(iter(saboteur.catalog))
    mixed = saboteur.generate_suite(
        intensity=0.9,
        target_ids=["FAULT-DOES-NOT-EXIST", known_id],
    )
    assert [f.id for f in mixed] == [known_id]


@pytest.mark.parametrize(
    "intensity,expected_count",
    [
        (0.1, 1),
        (0.2, 1),
        (0.21, 2),
        (0.5, 2),
        (0.6, 2),
        (0.61, 4),
        (1.0, 4),
    ],
)
def test_positive_intensity_sampling_policy_deterministic(intensity, expected_count):
    saboteur = Saboteur()
    all_faults = list(saboteur.catalog.values())

    with patch("random.sample", side_effect=lambda pop, k: pop[:k]) as mock_sample:
        faults = saboteur.generate_suite(intensity=intensity, target_ids=None)
        assert len(faults) == expected_count
        mock_sample.assert_called_once_with(all_faults, expected_count)
