function fn()
  while true do
    
  end
end

function fn2()
end

--[[
Scopes:

{
  name: 'fn',
  start: '1:0',
  end: '5:3',
  children: [
    {
      name: 'while',
      start: '2:13',
      end: '4:5'
    }
  ]
}

{
  name: 'fn2',
  start: '7:0',
  end: '8:3'
}

Given a position inside the "while" loop, 3:0, how do you determine which scope you're in?

Note: scopes don't overlap, and they are formed in stack fashion.
i.e. one scope's children scopes will all be fully contained within the parent scope.

so:

1. Iterate through the top-level scopes until you find the one that contains this position.
2. Iterate through that scope's children until you find one that contains this position.
3. Repeat step 2 until either the current scope has no children, or none of the children contain this position.

The last scope we were in is now the one that contains this position.

]]