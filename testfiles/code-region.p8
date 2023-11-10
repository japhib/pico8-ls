pico-8 cartridge // http://www.pico-8.com
version 29
__lua__
-- #region With Name

-- Region should fold all of this
function test()
  -- stupid simple function
end

function other_test()
  -- another stupid function
end

-- #endregion With Name

--#region Squished with label

-- this should get folded too

--#endregion Squished with label

--#region

-- Region without a label and no space between comment and region start and end

--#endregion

  -- #region Indented

  -- indented regions work great too

  -- #endregion

-- #region

-- Still collapsable

-- #endregion The end region can have a label without the region having one
