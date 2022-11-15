-- -- -- -- -- -- -- -- --
-- common/multicart.lua --
-- -- -- -- -- -- -- -- --

function _get_cart_param(index)
    local cart_params = split(stat(6))
    if #cart_params < index then
        return nil
    end
    local p = cart_params[index]
    -- stat(6) returns an empty string, if there are no params provided,
    -- therefore after split(…) we need to check if first extracted param isn't ""
    return p ~= "" and p or nil
end

function _load_main_cart(preselected_mission_number)
    local cart_params = tostr(preselected_mission_number)

    -- "load(…)" returns "false" if not failed and doesn't allow execution 
    -- of any further instruction if succeeded. This means we can safely
    -- try to load a cart under one of many possible file paths or BBS IDs.
    -- Please remember to load by BBS ID last, because we don't want online
    -- published version win with the locally developed one. Regarding local
    -- file paths, we use two variants here: one if we navigate in SPLORE to 
    -- inside of this game's directory and one if we started the game in 
    -- SPLORE from favorites tab (outside game's directory).
    load("dart-07.p8", nil, cart_params)
    load("dart-07/dart-07.p8", nil, cart_params)
    load("#brp_dart07", nil, cart_params)
end

function _load_mission_cart(mission_number, health, shockwave_charges, fast_movement, fast_shoot, triple_shoot, score)
    local cart_params = tostr(health) ..
        "," .. tostr(shockwave_charges) ..
        "," .. tostr(fast_movement) ..
        "," .. tostr(fast_shoot) ..
        "," .. tostr(triple_shoot) ..
        "," .. tostr(score)

    -- "load(…)" returns "false" if not failed and doesn't allow execution 
    -- of any further instruction if succeeded. This means we can safely
    -- try to load a cart under one of many possible file paths or BBS IDs.
    -- Please remember to load by BBS ID last, because we don't want online
    -- published version win with the locally developed one. Regarding local
    -- file paths, we use two variants here: one if we navigate in SPLORE to 
    -- inside of this game's directory and one if we started the game in 
    -- SPLORE from favorites tab (outside game's directory).
    load("dart-07-mission-" .. mission_number .. ".p8", nil, cart_params)
    load("dart-07/dart-07-mission-" .. mission_number .. ".p8", nil, cart_params)
    load("#brp_dart07_mission" .. mission_number, nil, cart_params)
end

-- docs about memory space:
--   - https://www.lexaloffle.com/dl/docs/pico-8_manual.html#Memory
--   - https://pico-8.fandom.com/wiki/Memory
function _copy_shared_assets_to_transferable_ram()
    -- 0x0000 = start of sprite sheet tabs 1-2
    -- 0x1000 = start of sprite sheet tabs 3-4, just after end of tabs 1-2
    -- 0x3200 = start of 64 SFXs (therefore length of 32 SFXs = (0x4300-0x3200)/2 = 0x880
    -- 0x4300 = user data start (transferable between carts), just after end of SFXs
    -- 0x5600 = custom font, just after end of user data

    -- copy first tab of the sprite sheet
    memcpy(0x0000, 0x4300, 0x0800)
    -- copy first 32 SFXs
    memcpy(0x3200, 0x4b00, 0x0880)
    -- we reached address 0x537f so far, which is within range of the user data 
end

-- docs about memory space:
--   - https://www.lexaloffle.com/dl/docs/pico-8_manual.html#Memory
--   - https://pico-8.fandom.com/wiki/Memory
function _copy_shared_assets_from_transferable_ram()
    -- 0x0000 = start of sprite sheet tabs 1-2
    -- 0x1000 = start of sprite sheet tabs 3-4, just after end of tabs 1-2
    -- 0x3200 = start of 64 SFXs (therefore length of 32 SFXs = (0x4300-0x3200)/2 = 0x880
    -- 0x4300 = user data start (transferable between carts), just after end of SFXs
    -- 0x5600 = custom font, just after end of user data

    -- copy first tab of the sprite sheet
    memcpy(0x4300, 0x0000, 0x0800)
    -- copy first 32 SFXs
    memcpy(0x4b00, 0x3200, 0x0880)
end
