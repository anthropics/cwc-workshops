---
name: mining
description: "Guides a Minecraft 1.20 agent through diamond mining: navigating to optimal Y levels, crafting the required pickaxe, locating diamond and deepslate diamond ore veins, and relocating between deposits. Use when the task involves mining diamonds, finding ore, choosing a Y level, or gathering resources at depth."
---

# Diamond Mining

Diamond ore generation peaks at **y ≈ -58** in Minecraft 1.18+. The pre-1.18 advice of y=11 is obsolete. Below y=0, the ore is almost always `deepslate_diamond_ore`, not `diamond_ore`, so search for both block names.

## Workflow

1. **Craft an iron pickaxe.** Diamond ore mined with a stone_pickaxe or weaker drops nothing. Craft the iron_pickaxe (3 iron_ingot + 2 sticks at a placed crafting_table) before mining diamond. A diamond_pickaxe is not required.

2. **Descend to y ≈ -55.** Call `go_near` with your current x/z and a deep y (e.g. `{"pos": {"x": <x>, "y": -55, "z": <z>}}`). The pathfinder digs straight down in one action. Don't `mine_block` stone repeatedly to descend; it wastes turns and pickaxe durability.

3. **Mine diamond ore.** Search for both `deepslate_diamond_ore` and `diamond_ore`. Mine each block with the iron pickaxe.

4. **Relocate between veins.** After exhausting a vein, `go_near` to a position 30+ blocks away horizontally at the same y before searching again. Diamond veins do not cluster; tunneling the same corridor wastes turns.
