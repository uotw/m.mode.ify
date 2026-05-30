#!/bin/bash
if [ -z $1 ]; then
echo "exiting"
exit
fi

X1=$1
Y1=$2
X2=$3
Y2=$4
INFILE=$5
OUTFILE=$6
IMGMGK=$7
DIR=$8
ANGLE=$(echo - | awk "{print 180*atan2($X2-$X1,$Y2-$Y1)/3.14159265359}")

OFFSET=$("$IMGMGK" convert $INFILE +distort SRT "$X1, $Y1, $ANGLE" -format "%X" -write info: +repage $DIR/rotated.png)
echo $OFFSET;
