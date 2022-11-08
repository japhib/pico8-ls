-- -- -- -- -- -- -- -- -- -- --
-- cart_main/screen_title.lua --
-- -- -- -- -- -- -- -- -- -- --

function new_screen_title(preselected_mission, start_music, start_fade_in, select_controls)
    local cart_label_mode = false
    -- DEBUG: enable this to show an image to create a cart label image from it
    --cart_label_mode = true

    local high_score

    local fade_in = new_fade("in", 30)

    local x_sprite = new_static_sprite("15,6,56,0", true)
    local x_pressed_sprite = new_static_sprite("15,6,56,6", true)

    local play = not select_controls

    local proceed = false

    local stars = {}

    local function maybe_add_star(y)
        if rnd() < .1 then
            local star = {
                x = ceil(1 + rnd(_vs - 3)),
                y = y,
                speed = rnd { .25, .5, .75 }
            }
            star.color = star.speed == .75 and _color_6_light_grey or (star.speed == .5 and _color_13_lavender or _color_14_mauve)
            add(stars, star)
        end
    end
    
    local function draw_version(base_y)
        _centered_print(_game_version, base_y, _color_14_mauve)
    end

    local function draw_title(base_y)
        sspr(
            96, 32,
            32, 26,
            (_vs - 96) / 2, base_y
        )
        sspr(
            96, 58,
            32, 26,
            (_vs - 96) / 2 + 32, base_y
        )
        sspr(
            96, 84,
            32, 26,
            (_vs - 96) / 2 + 64, base_y
        )
    end

    local function draw_high_score(base_y)
        _centered_print("high \-fscore", base_y, _color_6_light_grey)
        new_score(high_score)._draw(52, base_y + 10, _color_7_white, _color_14_mauve)
    end

    local function draw_button(text, w, base_x, base_y, selected)
        -- button shape
        sspr(
            selected and 35 or 36, 12,
            1, 12,
            base_x, base_y,
            w, 12
        )

        -- button text
        print(text, base_x + 4, base_y + 3, _color_14_mauve)

        -- "x" press incentive
        if selected then
            local sprite = _alternating_0_and_1() == 0 and x_sprite or x_pressed_sprite
            sprite._draw(-_gaox + base_x + w - 16, base_y + 13)
        end
    end

    --

    local screen = {}

    function screen._init()
        if start_music then
            music(2)
        end

        high_score = dget(0)
        -- DEBUG:
        --high_score = 123

        for y = 0, _vs - 1 do
            maybe_add_star(y)
        end
    end

    function screen._update()
        if btnp(_button_up) or btnp(_button_down) then
            _sfx_play(_sfx_options_change)
            play = not play
        end

        if btnp(_button_x) then
            _sfx_play(_sfx_options_confirm)
            proceed = true
        end

        for star in all(stars) do
            star.y = star.y + star.speed
            if star.y >= _vs then
                del(stars, star)
            end
        end
        maybe_add_star(0)

        fade_in._update()
    end

    function screen._draw()
        cls(_color_1_darker_blue)

        for star in all(stars) do
            pset(star.x, star.y, star.color)
        end

        map(cart_label_mode and 16 or 0, 0, 0, 0, 16, 16)

        if cart_label_mode then
            map(16, 0, 0, 0, 16, 16)

            -- brp
            pal(_color_10_unused, _color_14_mauve)
            sspr(
                99, 114,
                29, 14,
                (_vs - 29 * 2) / 2, 6,
                29 * 2, 14 * 2
            )
            pal(1)

            draw_title(55)

            -- ship
            new_static_sprite("10,10,18,0")._draw(_gawdb2, 110)
        else
            map(0, 0, 0, 0, 16, 16)
            draw_version(1)
            draw_title(15)
            draw_high_score(57)
            draw_button("play", 98, 15, 82, play)
            draw_button("controls", 98, 15, 104, not play)
        end

        if not cart_label_mode and start_fade_in then
            fade_in._draw()
        end
    end

    function screen._post_draw()
        if proceed then
            if play then
                return new_screen_select_mission(preselected_mission)
            else
                return new_screen_controls(preselected_mission)
            end
        end
    end

    return screen
end
