//
// Copyright © 2025 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Package resconv implements conversions to and from string representations of video resolutions.
package resconv

import (
	"sort"
	"strconv"
	"strings"
)

const (
	level360p  = "360p"
	level480p  = "480p"
	level720p  = "720p"
	level1080p = "1080p"
	level1440p = "1440p"
	level2160p = "2160p"
	level4320p = "4320p"
)

const defaultLevel = level360p

var prefixes = []struct {
	pixels int
	width  int
	height int
	label  string
}{
	{pixels: 640 * 360, width: 640, height: 360, label: level360p},
	{pixels: 1280 * 720, width: 720, height: 720, label: level480p},
	{pixels: 1920 * 1080, width: 1920, height: 1080, label: level720p},
	{pixels: 2560 * 1440, width: 2560, height: 1440, label: level1080p},
	{pixels: 3840 * 2160, width: 3840, height: 2160, label: level1440p},
	{pixels: 7680 * 4320, width: 7680, height: 4320, label: level2160p},
}

var bandwidthMap = map[string]int{
	level360p:  500000,
	level480p:  2000000,
	level720p:  5000000,
	level1080p: 8000000,
	level1440p: 12000000,
	level2160p: 25000000,
	level4320p: 50000000,
}

var resolutions = map[string]string{
	level360p:  "640:360",
	level480p:  "640:480",
	level720p:  "1280:720",
	level1080p: "1920:1080",
	level1440p: "2560:1440",
	level2160p: "3840:2160",
	level4320p: "7680:4320",
}

// SubLevels returns sublevels for the resolution
func SubLevels(resolution string) (res []string) {
	var height = Height(resolution)
	var idx = sort.Search(len(prefixes), func(i int) bool {
		return height < prefixes[i].height
	})
	if idx < 2 {
		return res
	}

	idx--
	idx = min(idx, 3)

	for idx >= 1 {
		res = append(res, prefixes[idx].label)
		idx--
		if len(res) == 2 {
			break
		}
	}

	return res
}

// Resolution returns default resolution based on the level
func Resolution(level string) string {
	if res, ok := resolutions[level]; ok {
		return res
	}
	return Resolution(defaultLevel)
}

// Level converts the resolution to short prefix
func Level(resolution string) string {
	var height = Height(resolution)
	idx := sort.Search(len(prefixes), func(i int) bool {
		return height < prefixes[i].height
	})
	if idx == len(prefixes) {
		return level4320p
	}

	return prefixes[idx].label
}

// Height returns height for the resolution
func Height(resolution string) int {
	var parts = strings.Split(resolution, ":")
	var h = 240
	if len(parts) > 1 {
		var _h, _ = strconv.Atoi(parts[1])
		h = max(h, _h)
	}
	return h
}

// Pixels returns amount of pixels for the resolution
func Pixels(resolution string) int {
	var parts = strings.Split(resolution, ":")
	var w, h = 320, 240

	if len(parts) > 1 {
		var _w, _ = strconv.Atoi(parts[0])
		var _h, _ = strconv.Atoi(parts[1])
		w = max(w, _w)
		h = max(h, _h)
	}

	return w * h
}

// Bandwidth returns default bandwidth for the resolution
func Bandwidth(resolution string) int {
	if v, ok := bandwidthMap[resolution]; ok {
		return v
	}

	return bandwidthMap[defaultLevel]
}
