-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 
-- common/movement/movement_fixed_factory.lua   --
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 

function new_movement_fixed_factory(params)
    params = params or {}

    return function(start_xy)
        local timer = params.frames and new_timer(params.frames) or new_fake_timer()

        local movement = {
            xy = start_xy,
            speed_xy = _xy_0_0,
            _update = timer._update,
        }

        function movement.has_finished()
            return timer.ttl <= 0
        end

        return movement
    end
end

