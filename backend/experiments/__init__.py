"""
Experiments package — reproducible evacuation simulation sweeps.

Public surface:
  - run_sweep(...)      : run an experiment over a parameter sweep
  - SweepRequest        : pydantic input shape (variable, values, repeats, seed)
  - SweepResult         : dataclass of per-trial metrics + summary stats
"""

from .runner import SweepRequest, SweepResult, run_sweep

__all__ = ["SweepRequest", "SweepResult", "run_sweep"]
