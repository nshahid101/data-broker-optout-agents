"""Builds the 4 agents and registers them so the `delegate` tool can find
any of them by name. Import this module (not the individual agent
files) to get a fully wired team.
"""

from backend.delegation import TEAM
from backend.discovery_agent import discovery_agent
from backend.models import AgentName
from backend.optout_agent import optout_agent
from backend.orchestrator_agent import orchestrator_agent
from backend.verify_agent import verify_agent

TEAM[AgentName.ORCHESTRATOR] = orchestrator_agent
TEAM[AgentName.DISCOVERY] = discovery_agent
TEAM[AgentName.OPTOUT] = optout_agent
TEAM[AgentName.VERIFY] = verify_agent
