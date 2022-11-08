-- -- -- -- -- -- -- -- -- -- -- -- -- --
-- cart_mission/game/player_bullet.lua --
-- -- -- -- -- -- -- -- -- -- -- -- -- --

function new_player_bullet(start_xy)
    local is_destroyed = false

    local bullet_sprite = new_static_sprite "4,5,9,11"

    local movement = new_movement_line_factory {
        angle = .25,
        angled_speed = 2.5,
        -- DEBUG:
        --angled_speed = .5,
        --frames = 10,
    }(start_xy)

    return {
        has_finished = function()
            return is_destroyed or _is_safely_outside_gameplay_area(movement.xy)
        end,

        collision_circle = function()
            return {
                xy = movement.xy.minus(0, .5),
                r = 1.5,
            }
        end,

        destroy = function()
            is_destroyed = true
        end,

        _update = movement._update,

        _draw = function()
            bullet_sprite._draw(movement.xy)
        end,
    }
end

