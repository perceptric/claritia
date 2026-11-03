// The words people read for the people who take leads and meetings. Teams aren't only sales, so it's "team member"
// and "team members", never "rep" or "reps"; the person a contact or company belongs to is its "owner". Code and
// database names keep their old spelling (router_reps, "rep" actions); only words on screen, in emails and in Slack
// come from here. tests/teamWords.test.ts fails if "rep" or "reps" shows up again.

export const MEMBER = "team member";
export const MEMBERS = "team members";
export const Member = "Team member";
export const Members = "Team members";
/** The team every workspace starts with (q_everyone). "Everyone" read badly next to "Everyone else". */
export const WHOLE_TEAM = "Whole team";
/** Names the starting team once had, read as the new one. A team someone renamed keeps its name. */
export const OLD_WHOLE_TEAM = ["Everyone", "All reps"];

/** "1 rule", "3 rules", "1 team member", "2 team members". */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where a meeting goes when no rule matches: "anyone on the team" for the starting team, else "anyone on Enterprise". */
export const anyoneOn = (team: string) => (team === WHOLE_TEAM || OLD_WHOLE_TEAM.includes(team) ? "anyone on the team" : `anyone on ${team}`);
