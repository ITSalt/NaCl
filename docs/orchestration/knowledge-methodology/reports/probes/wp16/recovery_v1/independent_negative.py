from candidate import check,digest
s={'project':'family-cinema-test','nodes':[{'id':'A','project':'family-cinema-test'},{'id':'B','project':'other-project'}],'edges':[{'source':'A','type':'DEPENDS_ON','target':'B'}]}
res=check(s,expected_project='family-cinema-test',expected_fence=7,current_fence=7,approved_digest=digest(s))
print('foreign_node_within_snapshot expected=BLOCKED_SCOPE observed='+res)
