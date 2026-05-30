#!/bin/bash
if [ -z $1 ]; then
echo "exiting"
exit
fi

DIR=$1
IMGMGK=$2
"$IMGMGK" convert +append $DIR/stills.*.png $DIR/mmode.png
"$IMGMGK" convert -gravity center -background black -interlace Line  -quality 100% -append -trim -fuzz 10% +repage $DIR/mmode.png $DIR/poster.png $DIR/mmode.png 
