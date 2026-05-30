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
IMGMGK=$6
DIR=$7
OFFSET=$8
ANGLE=$(echo - | awk "{print 180*atan2($X2-$X1,$Y2-$Y1)/3.14159265359}")

NEWXLOC=$((X1-OFFSET-1))
echo "$X1-$OFFSET-1=$NEWXLOC" >> $DIR/out.txt
"$IMGMGK" convert -virtual-pixel black +distort SRT "$X1, $Y1, $ANGLE"  +repage -crop "3x2500+$NEWXLOC-1+0" $INFILE $INFILE
#convert -virtual-pixel black +distort SRT "$X1, $Y1, $ANGLE"  +repage -crop "3x2500+$NEWXLOC-1+0" $INFILE $INFILE
